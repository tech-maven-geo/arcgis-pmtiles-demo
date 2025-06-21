import Graphic from "@arcgis/core/Graphic.js";
import { fromJSON as geometryFromJSON } from "@arcgis/core/geometry/support/jsonUtils.js"; // Updated import
import { deserialize } from 'flatgeobuf/lib/mjs/geojson.js'; // Ensure this path is correct for the installed package

// Helper to convert GeoJSON feature (from FlatGeobuf) to ArcGIS Graphic
function geojsonFeatureToArcGISGraphic(geojsonFeature) {
  if (!geojsonFeature || !geojsonFeature.geometry) {
    console.warn("Skipping feature due to missing geometry:", geojsonFeature);
    return null;
  }

  try {
    // Convert GeoJSON geometry to ArcGIS geometry.
    // The `geometryFromJSON` function expects an Esri JSON geometry object.
    // Standard GeoJSON geometry needs to be handled carefully or transformed if not directly compatible.
    // However, for simple point, line, polygon, it often works if the structure is similar.
    // A more robust approach might involve checking fgbFeature.geometry.type and using specific constructors
    // or a dedicated GeoJSON to ArcGIS Geometry converter if `geometryFromJSON` isn't robust enough for all GeoJSON types.
    // For now, we assume GeoJSON geometries produced by flatgeobuf's deserialize are compatible enough.
    // A common pattern is `Geometry.fromJSON(geojsonFeature.geometry)` but `geometryFromJSON` is the modern path.
    // Let's try with geometryFromJSON directly. It should handle GeoJSON geometry structure.
    const geometry = geometryFromJSON(geojsonFeature.geometry);

    if (!geometry) {
      console.warn("Could not convert GeoJSON geometry to ArcGIS geometry:", geojsonFeature.geometry);
      return null;
    }

    // Ensure spatialReference is set if available from GeoJSON (though often not at feature level)
    // or default to WGS84 if typical for FGB, then allow map to reproject.
    // If FGB has known CRS, it should be handled. FlatGeobuf header contains CRS.
    // For now, assume WGS84 if not specified, ArcGIS default.

    return new Graphic({
      geometry: geometry,
      attributes: geojsonFeature.properties || {}
    });
  } catch (error) {
    console.error("Error converting GeoJSON feature to ArcGIS Graphic:", error, geojsonFeature);
    return null;
  }
}

export async function loadFlatGeobuf(url, targetSr = null) {
  const graphics = [];
  let fgbHeader = null;

  try {
    // Fetch the entire file first. For very large files, streaming with `deserializeStream` is better.
    // However, `deserialize` can also work with a stream if `fetch(url).body` is passed.
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch FlatGeobuf file: ${response.statusText}`);
    }

    // Use response.body (ReadableStream) for deserialize for streaming processing
    const featureIterator = deserialize(response.body, undefined, (header) => {
        // Capture header information, especially CRS
        fgbHeader = header;
        // console.log("FlatGeobuf Header:", header);
    });

    for await (const feature of featureIterator) {
      const graphic = geojsonFeatureToArcGISGraphic(feature);
      if (graphic) {
        // Set spatial reference on geometry if known from FGB header and not on feature
        if (graphic.geometry && !graphic.geometry.spatialReference && fgbHeader && fgbHeader.crs) {
            // Assuming fgbHeader.crs contains WKID or WKT that can be used
            // For simplicity, common case is WGS84 (EPSG:4326)
            if (fgbHeader.crs.code === 4326) {
                graphic.geometry.spatialReference = { wkid: 4326 };
            }
            // More robust CRS handling would be needed here based on fgbHeader.crs content
        }
        graphics.push(graphic);
      }
    }

    // If a target spatial reference is provided and different from source, graphics should be reprojected.
    // However, FeatureLayer handles reprojection if its SR is different from graphics' SR.
    // For GraphicsLayer, ensure graphics are in map's SR or handle reprojection.

    return { graphics, header: fgbHeader };

  } catch (error) {
    console.error("Error loading or parsing FlatGeobuf data:", error);
    // Return what we have, or throw.
    return { graphics: [], header: null, error: error };
  }
}
/**
 * Example usage (to be placed in a Vue component or map initialization logic):
 *
 * import { loadFlatGeobuf } from './utils/flatgeobufLoader.js';
 * import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
 * import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
 * import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer.js';
 * import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol.js';
 * // Assuming 'map' is your ArcGIS Map instance
 *
 * async function addFlatGeobufLayerToMap(fgbUrl, map) {
 *   try {
 *     const { graphics, header, error } = await loadFlatGeobuf(fgbUrl);
 *
 *     if (error) {
 *       console.error("FlatGeobuf loading failed:", error);
 *       return;
 *     }
 *
 *     if (graphics.length === 0) {
 *       console.log("No graphics loaded from FlatGeobuf file.");
 *       return;
 *     }
 *
 *     // Ensure all graphics have attributes and a unique ID for FeatureLayer
 *     // Also, derive fields for FeatureLayer.
 *     let objectIdCounter = 0;
 *     const sampleAttributes = graphics[0].attributes || {};
 *     const fields = [{ name: "OBJECTID", type: "oid", alias: "OBJECTID" }];
 *
 *     for (const key in sampleAttributes) {
 *       if (sampleAttributes.hasOwnProperty(key)) {
 *         let type = "string"; // Default type
 *         if (typeof sampleAttributes[key] === 'number') type = "double"; // Or "integer"
 *         if (typeof sampleAttributes[key] === 'boolean') type = "boolean"; // Not a standard field type, often stored as small int or string
 *         fields.push({ name: key, type: type, alias: key });
 *       }
 *     }
 *
 *     graphics.forEach(g => {
 *       if (!g.attributes) g.attributes = {};
 *       g.attributes.OBJECTID = objectIdCounter++;
 *       // Ensure geometry has spatialReference, default to WGS84 if unknown and FGB header doesn't specify
 *       if (g.geometry && !g.geometry.spatialReference) {
 *          // Defaulting to WGS84 if not set by loader (from FGB header)
 *          // This is a fallback, proper CRS handling via fgbHeader.crs is preferred.
 *          g.geometry.spatialReference = { wkid: 4326 };
 *       }
 *     });
 *
 *     const geometryType = determineGeometryType(graphics); // Helper function needed
 *
 *     const fgbFeatureLayer = new FeatureLayer({
 *       source: graphics,
 *       objectIdField: "OBJECTID",
 *       fields: fields,
 *       geometryType: geometryType, // e.g., "point", "polyline", "polygon"
 *       // renderer can be set here if desired
 *       renderer: new SimpleRenderer({
 *          symbol: new SimpleMarkerSymbol({ color: "red", size: "6px", style: "circle" }) // Example for points
 *          // Add other symbols for lines/polygons if geometryType varies
 *       }),
 *       // Spatial reference of the layer. If graphics are in WGS84, and map is WebMercator,
 *       // FeatureLayer will handle reprojection.
 *       spatialReference: { wkid: 4326 } // Or derive from header.crs if available
 *     });
 *
 *     map.add(fgbFeatureLayer);
 *     // console.log("FlatGeobuf layer added to map", fgbFeatureLayer);
 *
 *   } catch (e) {
 *     console.error("Error in addFlatGeobufLayerToMap:", e);
 *   }
 * }
 *
 * function determineGeometryType(graphics) {
 *   if (!graphics || graphics.length === 0) return "unknown";
 *   const firstGeomType = graphics[0].geometry.type; // e.g. "point", "polyline", "polygon"
 *   // Add more robust checking if mixed geometry types, though FeatureLayer prefers single type.
 *   return firstGeomType;
 * }
 *
 * // Call it: addFlatGeobufLayerToMap('path/to/your/data.fgb', mapView.map);
 */
