import Graphic from "@arcgis/core/Graphic.js";
import { fromJSON as geometryFromJSON } from "@arcgis/core/geometry/support/jsonUtils.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";

function getAuthHeaders(authConfig) { // Copied from ogcApiFeaturesLoader, can be refactored to a common util
  const headers = {
    'Accept': 'application/geo+json, application/json;q=0.9, */*;q=0.8'
  };
  if (authConfig && authConfig.type && authConfig.type !== 'none') {
    if (authConfig.type === 'token' && authConfig.token) {
      headers['Authorization'] = `Bearer ${authConfig.token}`;
    } else if (authConfig.type === 'basic' && authConfig.username && authConfig.password) {
      try { headers['Authorization'] = `Basic ${btoa(`${authConfig.username}:${authConfig.password}`)}`; }
      catch (e) { console.error("btoa error (non-browser?):", e); }
    }
  }
  return headers;
}

function itemToArcGISGraphic(item, defaultSR = null) {
  if (!item || !item.geometry) { return null; }
  try {
    const geometry = geometryFromJSON(item.geometry);
    if (!geometry) { return null; }
    if (!geometry.spatialReference) {
      geometry.spatialReference = defaultSR || new SpatialReference({ wkid: 4326 });
    }
    const attributes = { ...(item.properties || {}), id: item.id };
    if (item.assets) attributes.assets = JSON.stringify(item.assets); // Stringify for simple display
    if (item.links) attributes.links = JSON.stringify(item.links);
    if (item.properties?.datetime) attributes.datetime = item.properties.datetime;
    attributes.title = item.properties?.title || item.id || 'N/A'; // Ensure title for popup

    return new Graphic({ geometry, attributes });
  } catch (error) {
    console.error("Error converting STAC/Record item to ArcGIS Graphic:", error, item);
    return null;
  }
}

export async function searchOgcRecordsStac(serviceUrl, queryParams = {}, isStacHint = false, authConfig = null) {
  let endpointPath = "items"; // A common path, STAC might use /search
  let usePost = false; // STAC /search often uses POST for complex queries

  // Basic heuristic for endpoint:
  // If serviceUrl ends with /search, assume it's a STAC search endpoint.
  // Otherwise, if isStacHint is true, try /search.
  // For OGC API Records, path could be /records or /collections/{id}/items. This is simplified.
  let targetUrl;
  if (serviceUrl.toLowerCase().endsWith("/search")) {
      targetUrl = new URL(serviceUrl); // Use as is
      // TODO: Implement POST if queryParams are complex (e.g., 'filter' or 'intersects')
      // For now, assuming GET for /search with simple params.
  } else if (isStacHint) {
      targetUrl = new URL("search", serviceUrl.endsWith('/') ? serviceUrl : serviceUrl + '/');
      // Could also check if queryParams.collections has a single value, then use /collections/{val}/items
  } else { // Generic OGC API (Records or Features-like items endpoint)
      targetUrl = new URL("items", serviceUrl.endsWith('/') ? serviceUrl : serviceUrl + '/');
      // Some OGC API Records might use /records directly. This needs flexibility or config.
  }

  // Append GET parameters
  const defaultLimit = queryParams.limit || 50;
  targetUrl.searchParams.append('limit', String(defaultLimit));

  for (const [key, value] of Object.entries(queryParams)) {
    if (key !== 'limit' && value !== undefined && value !== null && String(value).trim() !== '') {
      // For 'collections' in STAC, it might be an array. API may expect comma-separated string.
      if (key === 'collections' && Array.isArray(value)) {
        targetUrl.searchParams.append(key, value.join(','));
      } else {
        targetUrl.searchParams.append(key, String(value));
      }
    }
  }

  const finalUrlString = targetUrl.toString();
  const graphics = [];
  const items = [];

  try {
    // console.log(`Searching OGC Records/STAC GET: ${finalUrlString}`);
    const fetchOptions = { method: 'GET', headers: getAuthHeaders(authConfig) };
    // TODO: If usePost is true:
    // fetchOptions.method = 'POST';
    // fetchOptions.body = JSON.stringify(queryParamsForPostBody); // queryParams would need structuring for POST
    // fetchOptions.headers['Content-Type'] = 'application/json';

    const response = await fetch(finalUrlString, fetchOptions);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Search failed: ${response.status} ${response.statusText}. Server: ${errorText} (URL: ${finalUrlString})`);
    }
    const responseData = await response.json();

    if (!responseData || responseData.type !== "FeatureCollection" || !Array.isArray(responseData.features)) {
       if (responseData && responseData.type === "FeatureCollection" && responseData.features === undefined) {
           // An empty features collection is valid.
       } else {
           throw new Error("Invalid GeoJSON FeatureCollection structure from OGC Records/STAC search.");
       }
    }

    const defaultSR = new SpatialReference({ wkid: 4326 });
    if (responseData.features) {
        for (const feature of responseData.features) {
          items.push(feature);
          const graphic = itemToArcGISGraphic(feature, defaultSR);
          if (graphic) { graphics.push(graphic); }
        }
    }

    const totalMatched = responseData.numberMatched // OGC API
                       || responseData.context?.matched // STAC API v0.9 / v1.0.0-rc (numberMatched in 1.0 final)
                       || responseData.numberTotal // Some older STAC versions
                       || (responseData.features ? responseData.features.length : 0); // Fallback

    return { graphics, items, totalMatched, links: responseData.links };

  } catch (error) {
    console.error("Error searching OGC Records/STAC:", error);
    return { graphics: [], items: [], totalMatched: 0, error: error.message || "Unknown error" };
  }
}
