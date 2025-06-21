import Graphic from "@arcgis/core/Graphic.js";
import { fromJSON as geometryFromJSON } from "@arcgis/core/geometry/support/jsonUtils.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";

function getAuthHeaders(authConfig) {
  const headers = {
    'Accept': 'application/geo+json, application/json;q=0.9, */*;q=0.8'
  };

  if (authConfig && authConfig.type && authConfig.type !== 'none') {
    if (authConfig.type === 'token' && authConfig.token) {
      headers['Authorization'] = `Bearer ${authConfig.token}`;
    } else if (authConfig.type === 'basic' && authConfig.username && authConfig.password) {
      try {
        headers['Authorization'] = `Basic ${btoa(`${authConfig.username}:${authConfig.password}`)}`;
      } catch (e) {
        console.error("Error during btoa encoding (running in non-browser?):", e);
        // btoa is not available in Node.js without polyfill/buffer
      }
    }
  }
  return headers;
}

// Helper to convert GeoJSON feature to ArcGIS Graphic
function geojsonFeatureToArcGISGraphic(geojsonFeature, defaultSR = null) {
  if (!geojsonFeature || !geojsonFeature.geometry) {
    // console.warn("Skipping feature due to missing geometry:", geojsonFeature);
    return null;
  }

  try {
    const geometry = geometryFromJSON(geojsonFeature.geometry);
    if (!geometry) {
      // console.warn("Could not convert GeoJSON geometry to ArcGIS geometry:", geojsonFeature.geometry);
      return null;
    }
    if (!geometry.spatialReference) {
        geometry.spatialReference = defaultSR || new SpatialReference({ wkid: 4326 });
    }

    return new Graphic({
      geometry: geometry,
      attributes: geojsonFeature.properties || {}
    });
  } catch (error) {
    console.error("Error converting GeoJSON feature to ArcGIS Graphic:", error, geojsonFeature);
    return null;
  }
}


export async function getOgcApiCollections(serviceUrl, authConfig) {
  const baseUrl = serviceUrl.endsWith('/') ? serviceUrl : serviceUrl + '/';
  const collectionsUrl = new URL("collections", baseUrl).toString();

  try {
    const headers = getAuthHeaders(authConfig);
    headers['Accept'] = 'application/json';

    const response = await fetch(collectionsUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch collections: ${response.status} ${response.statusText} (URL: ${collectionsUrl})`);
    }
    const data = await response.json();
    if (!data.collections) {
        throw new Error("No 'collections' array found in response from " + collectionsUrl);
    }
    return data.collections;
  } catch (error) {
    console.error("Error fetching OGC API Feature collections:", error);
    throw error;
  }
}

export async function getOgcApiCollectionDetails(serviceUrl, collectionId, authConfig) {
  const baseUrl = serviceUrl.endsWith('/') ? serviceUrl : serviceUrl + '/';
  const collectionUrl = new URL(`collections/${collectionId}`, baseUrl).toString();
  try {
    const headers = getAuthHeaders(authConfig);
    headers['Accept'] = 'application/json';

    const response = await fetch(collectionUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch collection details for ${collectionId}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching OGC API details for collection ${collectionId}:`, error);
    throw error;
  }
}

export async function loadOgcApiFeatures(serviceUrl, collectionId, queryParams = {}, authConfig) {
  const baseUrl = serviceUrl.endsWith('/') ? serviceUrl : serviceUrl + '/';
  const itemsUrl = new URL(`collections/${collectionId}/items`, baseUrl);

  const defaultLimit = 250;
  queryParams.limit = queryParams.limit || defaultLimit;

  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
        itemsUrl.searchParams.append(key, value);
    }
  }

  const graphics = [];
  try {
    const headers = getAuthHeaders(authConfig);

    const response = await fetch(itemsUrl.toString(), { headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch OGC API features for ${collectionId}: ${response.status} ${response.statusText}. Server: ${errorText} (URL: ${itemsUrl.toString()})`);
    }
    const geojsonData = await response.json();

    if (!geojsonData || geojsonData.type !== "FeatureCollection") {
        // Allow empty features array, but structure must be FeatureCollection
        if (geojsonData && Array.isArray(geojsonData.features) && geojsonData.features.length === 0) {
            // This is an empty but valid FeatureCollection
        } else {
            throw new Error("Invalid or missing GeoJSON FeatureCollection structure received.");
        }
    }

    const defaultSR = new SpatialReference({ wkid: 4326 });

    if (geojsonData.features && Array.isArray(geojsonData.features)) {
        for (const feature of geojsonData.features) {
          const graphic = geojsonFeatureToArcGISGraphic(feature, defaultSR);
          if (graphic) {
            graphics.push(graphic);
          }
        }
    }

    return {
        graphics,
        numberMatched: geojsonData.numberMatched,
        numberReturned: geojsonData.numberReturned,
        links: geojsonData.links
    };

  } catch (error) {
    console.error(`Error loading OGC API Features for collection ${collectionId}:`, error);
    return { graphics: [], error: error, numberMatched:0, numberReturned:0, links:[] };
  }
}
