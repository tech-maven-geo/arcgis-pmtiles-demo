import BaseTileLayer from "@arcgis/core/layers/BaseTileLayer.js";
import { PMTiles } from "pmtiles"; // Assuming pmtiles is installed

// Cache for PMTiles instances
const pmtilesInstances = new Map();

const PMTilesVectorLayer = BaseTileLayer.createSubclass({
  properties: {
    url: null, // URL to the PMTiles archive
    pmtilesInstance: null,
    // A Mapbox GL style object or URL could be added here for styling
    // style: null,
  },

  constructor(properties) {
    // Call super or handle properties as needed by BaseTileLayer
    // super(properties); // This might be needed depending on BaseTileLayer's constructor
    if (properties && properties.url) {
      this.url = properties.url;
    }
    // Initialize other properties if necessary
  },

  async load(options) {
    if (!this.url) {
      this.error = new Error("PMTilesVectorLayer: URL is not set.");
      console.error(this.error.message);
      this.emit("load"); // Emit load to signal completion, even on error
      return;
    }

    try {
      if (pmtilesInstances.has(this.url)) {
        this.pmtilesInstance = pmtilesInstances.get(this.url);
      } else {
        // PMTiles constructor can take URL and handle fetching.
        this.pmtilesInstance = new PMTiles(this.url);
        // The getHeader method is implicitly called by the PMTiles constructor
        // or on first operation if needed. To be safe, explicitly wait for it.
        // However, the library is designed to be efficient.
        // Let's assume header is available after instantiation for properties.
        // To be certain, one might await a specific call that requires header,
        // e.g., this.pmtilesInstance.getMetadata() or similar if available,
        // or proceed and let errors occur if header isn't ready for some property access.
        // For now, we rely on PMTiles internal handling.
        // Consider: await this.pmtilesInstance.getHeader(); if direct access to header properties is needed immediately.
        // Storing the instance after it's successfully created:
        pmtilesInstances.set(this.url, this.pmtilesInstance);
      }

      // Attempt to get header data after instance is confirmed/created
      const header = await this.pmtilesInstance.getHeader();
      if (!header) {
        throw new Error("Failed to load PMTiles header.");
      }

      // Ensure it's a vector tile type (PBF)
      // PMTiles spec v3: tileType 1 for MVT (PBF)
      if (header.tileType !== 1) {
        throw new Error(`PMTiles archive at ${this.url} is not of type PBF/MVT (tileType: ${header.tileType}). This layer only supports vector PMTiles.`);
      }

      // Define tileInfo. This is crucial for BaseTileLayer.
      // For vector tiles, format can be "pbf". LODs (Levels of Detail) are important.
      // A simple LOD structure based on min/max zoom from PMTiles header:
      const lods = [];
      for (let i = header.minZoom; i <= header.maxZoom; i++) {
        // Resolution calculation would typically be based on tile size and geographic extent at that zoom level.
        // This is a placeholder for resolution.
        lods.push({ level: i, resolution: 78271.51696402048 / Math.pow(2, i), scale: 295828763.7957772 / Math.pow(2,i) });
      }

      this.tileInfo = {
        size: [256, 256], // Vector tiles are often on a 256x256 grid, though rendered to 512x512 viewports in some systems
        format: "pbf",    // Format of the tile data being returned by fetchTile
        dpi: 96,
        origin: { // Top-left corner of the tiling scheme
          x: -20037508.342787,
          y: 20037508.342787
        },
        spatialReference: { // Default Web Mercator
          wkid: 3857 // Or 102100
        },
        lods: lods
      };

      this.fullExtent = {
        xmin: header.minLon,
        ymin: header.minLat,
        xmax: header.maxLon,
        ymax: header.maxLat,
        spatialReference: { wkid: 4326 } // Extent from PMTiles is usually WGS84
      };
      // If the layer's tileInfo is in Web Mercator (3857), and fullExtent is WGS84 (4326),
      // the map view will handle reprojection. Ensure consistency or handle projection.

      this.emit("load");
    } catch (error) {
      console.error("PMTilesVectorLayer: Error loading PMTiles archive:", error);
      this.error = error;
      this.emit("load");
    }
  },

  // fetchTile will return ArrayBuffer for PBF tiles
  async fetchTile(level, row, col, options) {
    try {
      if (!this.pmtilesInstance) {
        // This might be called if the layer is added to map before 'url' is set and load() hasn't completed.
        // Attempt to load it.
        if (this.load) { // Check if load method exists
             await this.load(); // Ensure load is called and awaited
        }
        if (!this.pmtilesInstance) { // Check again
          console.warn("PMTiles instance not available in fetchTile for vector layer.");
          // Cannot throw error here as it might break tile fetching pipeline for other tiles.
          // Return null to indicate no data.
          return null;
        }
      }

      // PMTiles getZxy expects z, x, y. ArcGIS provides level, row, col.
      const tileData = await this.pmtilesInstance.getZxy(level, col, row); // z, x, y

      if (tileData && tileData.data) {
        // For PBF, we return the ArrayBuffer directly.
        // The key challenge: BaseTileLayer itself does NOT render PBFs with styling.
        // This layer provides the PBF data. A consuming mechanism (e.g., a custom WebGL renderer
        // or a parser that converts PBF to Graphics) would be needed.
        return tileData.data; // This is an ArrayBuffer.
      } else {
        // Tile not found or empty.
        return null;
      }
    } catch (error) {
      // console.warn(`PMTilesVectorLayer: Error fetching PBF tile ${level}/${row}/${col}:`, error);
      // It's common for tiles to be missing (e.g. outside of actual data bounds within the PMTiles file)
      // or for network errors. Returning null is standard for "no data for this tile".
      return null;
    }
  }

  // getTileUrl is not needed if fetchTile is implemented and returns data directly.
});

export default PMTilesVectorLayer;
