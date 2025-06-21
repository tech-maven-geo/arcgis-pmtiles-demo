import BaseTileLayer from "@arcgis/core/layers/BaseTileLayer.js";
import Extent from "@arcgis/core/geometry/Extent.js"; // Correct import path
import TileInfo from "@arcgis/core/layers/support/TileInfo.js";
import LOD from "@arcgis/core/layers/support/LOD.js";

const MapzenTerrariumLayer = BaseTileLayer.createSubclass({
  properties: {
    urlTemplate: String, // e.g., "https://tile.nextzen.org/tilezen/terrain/v1/256/terrarium/{level}/{col}/{row}.png?api_key={apiKey}"
                         // Or "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{level}/{col}/{row}.png"
    apiKey: String, // Optional: If using Nextzen or other services requiring an API key
    // minDataValue: { value: -11000, type: Number }, // Approx lowest elevation on Earth (Dead Sea/Mariana Trench)
    // maxDataValue: { value: 9000, type: Number } // Approx highest elevation (Everest)
                   // These could be used for consistent global normalization instead of per-tile.
  },

  constructor(properties) {
    // Default TileInfo for Terrarium PNG tiles (Web Mercator)
    // Max zoom for Terrarium tiles is typically around 15.
    const lods = [];
    for (let level = 0; level <= 15; level++) {
      lods.push(new LOD({
        level: level,
        resolution: 156543.03392800014 / Math.pow(2, level),
        scale: 591657527.591555 / Math.pow(2, level)
      }));
    }

    const defaultTileInfo = new TileInfo({
      size: [256, 256],
      format: "PNG", // Input format of the tiles fetched
      dpi: 96, // Standard DPI
      origin: { x: -20037508.342787, y: 20037508.342787 }, // Top-left of Web Mercator
      spatialReference: { wkid: 3857 }, // Web Mercator
      lods: lods
    });

    // Merge with user-provided properties, ensuring tileInfo is set
    // User can override tileInfo if they have a custom scheme for Terrarium-like tiles.
    const effectiveProperties = {
      tileInfo: defaultTileInfo,
      fullExtent: new Extent({ // Default to world extent for Web Mercator
            xmin: -20037508.342787, ymin: -20037508.342787,
            xmax: 20037508.342787, ymax: 20037508.342787,
            spatialReference: { wkid: 3857 }
      }),
      ...properties // User properties will override defaults if provided
    };
    // super(effectiveProperties);
    // The 'properties' object passed to the constructor of BaseTileLayer.createSubclass
    // defines the class's own properties. The actual values are set on instances.
    // The constructor here is for instance initialization.
    // BaseTileLayer's constructor will be called implicitly.
    // We need to ensure 'this.tileInfo' and 'this.fullExtent' are set if not provided.
    if (!this.tileInfo && properties && !properties.tileInfo) this.tileInfo = defaultTileInfo;
    if (!this.fullExtent && properties && !properties.fullExtent) {
         this.fullExtent = new Extent({
            xmin: -20037508.342787, ymin: -20037508.342787,
            xmax: 20037508.342787, ymax: 20037508.342787,
            spatialReference: { wkid: 3857 }
      });
    }
  },

  getTileUrl(level, row, col) {
    if (!this.urlTemplate) {
      console.error("MapzenTerrariumLayer: urlTemplate is not set on the layer instance.");
      return null;
    }
    let url = this.urlTemplate
      .replace("{level}", level)
      .replace("{row}", row)
      .replace("{col}", col);
    if (this.apiKey) {
      url = url.replace("{apiKey}", this.apiKey);
    } else {
      // If apiKey placeholder exists but no key provided, it might lead to errors.
      // Consider removing `?api_key=` if apiKey is null/empty and placeholder indicates optional.
      url = url.replace("&api_key={apiKey}", "").replace("?api_key={apiKey}", "");
    }
    return url;
  },

  async fetchTile(level, row, col, options) {
    const url = this.getTileUrl(level, row, col);
    if (!url) return this.createEmptyTileBitmap();

    try {
      const response = await fetch(url, { signal: options?.signal });
      if (!response.ok) {
        // console.warn(`Failed to fetch Mapzen tile ${level}/${row}/${col}: ${response.statusText}`);
        return this.createEmptyTileBitmap();
      }
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      return this.decodeAndVisualizeTile(imageBitmap);
    } catch (error) {
      if (error.name !== 'AbortError') {
        // console.warn(`Error fetching/processing Mapzen tile ${level}/${row}/${col}:`, error);
      }
      return this.createEmptyTileBitmap();
    }
  },

  decodeAndVisualizeTile(sourceImageBitmap) {
    const width = sourceImageBitmap.width;
    const height = sourceImageBitmap.height;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceImageBitmap, 0, 0);

    let imageData;
    try {
        imageData = ctx.getImageData(0, 0, width, height);
    } catch(e) {
        console.error("Security error reading canvas pixel data (tainted canvas). Ensure tiles are served with CORS headers.", e);
        // Create an empty (transparent) image bitmap as fallback
        const emptyCanvas = document.createElement('canvas');
        emptyCanvas.width = width;
        emptyCanvas.height = height;
        return createImageBitmap(emptyCanvas);
    }
    const data = imageData.data;

    const greyscaleImageData = ctx.createImageData(width, height);
    const greyscaleData = greyscaleImageData.data;

    let minElevation = this.minDataValue !== undefined ? this.minDataValue : Infinity;
    let maxElevation = this.maxDataValue !== undefined ? this.maxDataValue : -Infinity;
    const useGlobalMinMax = this.minDataValue !== undefined && this.maxDataValue !== undefined;

    const decodedElevations = new Float32Array(width * height);

    if (!useGlobalMinMax) { // Calculate per-tile min/max if global not set
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const elevation = (r * 256 + g + b / 256) - 32768;
            decodedElevations[i / 4] = elevation;
            if (elevation < minElevation) minElevation = elevation;
            if (elevation > maxElevation) maxElevation = elevation;
        }
    } else { // Use global min/max, just decode
         for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            decodedElevations[i / 4] = (r * 256 + g + b / 256) - 32768;
        }
    }

    const elevationRange = maxElevation - minElevation;

    for (let i = 0; i < decodedElevations.length; i++) {
      let greyValue = 0; // Default to black for no-data or below min
      const elevation = decodedElevations[i];

      if (elevationRange > 0) {
        const normalized = (elevation - minElevation) / elevationRange;
        greyValue = Math.max(0, Math.min(255, Math.round(normalized * 255)));
      } else if (elevation >= minElevation) { // If range is 0, all valid data is same value
        greyValue = 128; // Mid-grey
      }

      const dataIdx = i * 4;
      greyscaleData[dataIdx] = greyValue;
      greyscaleData[dataIdx + 1] = greyValue;
      greyscaleData[dataIdx + 2] = greyValue;
      greyscaleData[dataIdx + 3] = 255; // Opaque
    }
    return createImageBitmap(greyscaleImageData);
  },

  createEmptyTileBitmap() {
    const canvas = document.createElement("canvas");
    // Ensure tileInfo is available, might need to access it via this.tileInfo if constructor setup is correct
    const tileInfo = this.tileInfo || (this.constructor).prototype.tileInfo; // Fallback, not ideal
    canvas.width = tileInfo ? tileInfo.size[0] : 256;
    canvas.height = tileInfo ? tileInfo.size[1] : 256;
    return createImageBitmap(canvas); // Transparent by default
  }
});

// Set default tileInfo on prototype for instances if not overridden
MapzenTerrariumLayer.prototype.tileInfo = new TileInfo({
    size: [256, 256], format: "PNG", dpi: 96,
    origin: { x: -20037508.342787, y: 20037508.342787 },
    spatialReference: { wkid: 3857 },
    lods: (() => {
        const lods = [];
        for (let level = 0; level <= 15; level++) {
            lods.push(new LOD({ level: level, resolution: 156543.03392800014 / Math.pow(2, level), scale: 591657527.591555 / Math.pow(2, level) }));
        }
        return lods;
    })()
});
MapzenTerrariumLayer.prototype.fullExtent = new Extent({
    xmin: -20037508.342787, ymin: -20037508.342787,
    xmax: 20037508.342787, ymax: 20037508.342787,
    spatialReference: { wkid: 3857 }
});


export default MapzenTerrariumLayer;
