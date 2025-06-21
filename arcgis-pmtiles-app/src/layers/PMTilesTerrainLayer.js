import BaseTileLayer from "@arcgis/core/layers/BaseTileLayer.js";
import { PMTiles } from "pmtiles"; // Assuming pmtiles is installed
// For LERC decoding, if we were to do it client-side for visualization or direct use:
// import LERC from 'lerc'; // Example: const { LercDecode } = LERC;

// Cache for PMTiles instances
const pmtilesInstances = new Map();

const PMTilesTerrainLayer = BaseTileLayer.createSubclass({
  properties: {
    url: null, // URL to the PMTiles archive
    pmtilesInstance: null,
    // tileDataType: "elevation", // Could be a property to hint at usage
  },

  constructor(properties) {
    // super(properties); // BaseTileLayer constructor
    if (properties && properties.url) {
      this.url = properties.url;
    }
  },

  async load(options) {
    if (!this.url) {
      this.error = new Error("PMTilesTerrainLayer: URL is not set.");
      console.error(this.error.message);
      this.emit("load"); // Ensure load event fires to signal completion or error
      return;
    }

    try {
      if (pmtilesInstances.has(this.url)) {
        this.pmtilesInstance = pmtilesInstances.get(this.url);
      } else {
        this.pmtilesInstance = new PMTiles(this.url);
        // No explicit await this.pmtilesInstance.getHeader() here,
        // as PMTiles class handles internal initialization.
        // We will await getHeader() when we need its contents.
        pmtilesInstances.set(this.url, this.pmtilesInstance);
      }

      const header = await this.pmtilesInstance.getHeader();
      if (!header) {
        throw new Error("Failed to load PMTiles header for terrain layer.");
      }

      // Identifying LERC:
      // This is a challenge with PMTiles spec v3 as tileType doesn't specify LERC.
      // We might rely on user knowing the content is LERC, or inspect CompressionType
      // if the pmtiles library surfaces it from individual tile entries, or if the
      // main PMTiles header had a 'content_type' or 'compression' field.
      // For now, this layer assumes the PMTiles URL points to LERC data.
      // Example check (conceptual):
      // if (header.compression !== "lerc" && header.tileType !== "lerc_custom") {
      //   console.warn(`PMTiles archive at ${this.url} may not be LERC. Layer may not work as expected.`);
      // }


      const lods = [];
      for (let i = header.minZoom; i <= header.maxZoom; i++) {
        // Standard Web Mercator LODs
        lods.push({
          level: i,
          resolution: 156543.03392800014 / Math.pow(2, i), // Corrected initial resolution for Web Mercator
          scale: 591657527.591555 / Math.pow(2, i)  // Corrected initial scale
        });
      }

      this.tileInfo = {
        size: [256, 256], // Common tile size for LERC, though data can be varied.
        format: "lerc",   // Custom format string, indicating LERC data in fetchTile.
                          // This isn't a format BaseTileLayer understands for rendering.
        dpi: 96,
        origin: { x: -20037508.342787, y: 20037508.342787 }, // Top-left of Web Mercator
        spatialReference: { wkid: 3857 }, // Tiling scheme in Web Mercator
        lods: lods
      };

      this.fullExtent = { // Extent of the data within PMTiles, usually WGS84
        xmin: header.minLon,
        ymin: header.minLat,
        xmax: header.maxLon,
        ymax: header.maxLat,
        spatialReference: { wkid: 4326 }
      };

      this.emit("load");
    } catch (error) {
      console.error("PMTilesTerrainLayer: Error loading PMTiles archive:", error);
      this.error = error;
      this.emit("load");
    }
  },

  // fetchTile will return ArrayBuffer for LERC tiles
  async fetchTile(level, row, col, options) {
    try {
      if (!this.pmtilesInstance) {
        if (this.load) await this.load(); // Ensure layer is loaded
        if (!this.pmtilesInstance) { // Check again
          console.warn("PMTiles instance not available in fetchTile for terrain layer.");
          return null; // No data if instance isn't ready
        }
      }

      const tileData = await this.pmtilesInstance.getZxy(level, col, row); // z, x, y

      if (tileData && tileData.data) {
        // Return the raw LERC ArrayBuffer.
        // This buffer needs to be decoded by a LERC decoder.
        // If this layer were to visualize directly, it would decode to pixel data (e.g., greyscale)
        // and return an ImageBitmap. For use as an elevation source, this ArrayBuffer
        // would be passed to an ElevationProvider that decodes it.
        return tileData.data; // This is a LERC-compressed ArrayBuffer.
      } else {
        // Tile not found or empty
        return null;
      }
    } catch (error) {
      // console.warn(`PMTilesTerrainLayer: Error fetching LERC tile ${level}/${row}/${col}:`, error);
      // It's common for tiles to be missing.
      return null;
    }
  }
});

export default PMTilesTerrainLayer;
