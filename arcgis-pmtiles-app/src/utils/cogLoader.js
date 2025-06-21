import ImageryTileLayer from "@arcgis/core/layers/ImageryTileLayer.js";
import RasterStretchRenderer from "@arcgis/core/renderers/RasterStretchRenderer.js"; // For example renderer

export function createCogLayer(url, options = {}) {
  if (!url) {
    console.error("COG URL is not provided.");
    return null;
  }

  try {
    // Default options for a generic COG.
    // Users can override these via the 'options' parameter.
    const defaultOptions = {
      // format: "tiff", // "tiff", "png", "jpg", "lerc". Layer usually auto-detects.
                         // For elevation data, "lerc" is good if COG is LERC compressed.
                         // For visual imagery, often not needed or could be "jpeg" / "png".
      // rasterFunction: null, // For applying server-side or client-side raster functions
    };

    const layerProperties = { ...defaultOptions, url, ...options };

    const cogLayer = new ImageryTileLayer(layerProperties);

    // Example: If you want to ensure a default renderer for visualization,
    // especially for single-band or elevation data that might not render well by default.
    // This is just an example; renderer setup depends heavily on COG content.
    if (!layerProperties.renderer && cogLayer.rasterInfo) { // Check if rasterInfo is available after instantiation
        // This might be better done after layer.load() if rasterInfo is needed
        // For now, this is a simple example.
    }


    return cogLayer;
  } catch (error) {
    console.error("Error creating COG Layer:", error);
    return null;
  }
}

// Example of how to use this loader in a map component:
/*
import { createCogLayer } from './utils/cogLoader';
import Map from "@arcgis/core/Map.js"; // Assuming Map and MapView are set up
import MapView from "@arcgis/core/views/MapView.js";

// Assuming 'map' is your ArcGIS Map instance from MapView.map
// In your Vue component (e.g., MapView.vue or another component)

async function addCogLayerToMap(cogUrl, mapInstance, viewInstance) {
  try {
    const layerOptions = {
      title: "Cloud Optimized GeoTIFF", // Set a title for the layer
      // Example for an elevation COG - apply a stretch renderer
      // renderer: new RasterStretchRenderer({
      //   stretchType: "min-max",
      //   dra: true, // Dynamic Range Adjustment helps with visualization
      //   useGamma: true,
      //   gamma: [1, 1, 1] // Default gamma
      // }),
      // bandIds: [0], // For single-band elevation
      // format: "lerc" // If you know it's LERC compressed elevation
    };

    const cogLayer = createCogLayer(cogUrl, layerOptions);

    if (cogLayer) {
      mapInstance.add(cogLayer);
      console.log("COG layer added to map. Waiting for it to load...");

      // Optionally, wait for the layer to load and then interact with it
      // (e.g., zoom to its extent)
      await cogLayer.when(); // Equivalent to layer.load().then(...)

      console.log("COG layer loaded successfully.");
      if (cogLayer.fullExtent && viewInstance) {
        // console.log("Zooming to COG layer extent:", cogLayer.fullExtent.toJSON());
        // viewInstance.goTo(cogLayer.fullExtent).catch(err => console.error("Error zooming to extent:", err));
      } else {
        // console.log("COG Layer fullExtent not available or viewInstance not provided.");
      }
    }
  } catch (error) {
    // This catch is for errors in the addCogLayerToMap function itself.
    // Errors from createCogLayer are logged by that function and return null.
    console.error("Failed to add COG layer to map:", error);
  }
}

// Example call (ensure mapInstance and viewInstance are available):
// let myMap = new Map({ basemap: "streets-vector" });
// let myView = new MapView({ container: "viewDiv", map: myMap, center: [0,0], zoom: 2 });
// myView.when(() => {
//   addCogLayerToMap('https://your-cog-url/example.tif', myMap, myView);
// });
*/
