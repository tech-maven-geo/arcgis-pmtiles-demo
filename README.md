# arcgis-pmtiles-flatgeobuf-cog-demo
orignally developed by Google Jules https://jules.google.com/task/15783822907289797049
This is a demo application to showcase loading Cloud Native Optimized File Formats (COG, PMTILES and FlatGeoBuf)

create a vuejs esri arcgis maps sdk for javascript mapping application that can connect to a URL of cloud hosted/static hosted PMTILES vector tiles (PBF/MVT), raster tiles (PNG, JPG, Web), terrain elevation tiles (LERC2)   https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md  https://guide.cloudnativegeo.org/pmtiles/intro.html https://github.com/protomaps/PMTiles https://til.simonwillison.net/gis/pmtiles  https://loaders.gl/docs/modules/pmtiles/api-reference/pmtiles-source https://loaders.gl/examples/tiles/pmtiles extend and customize the custom tile layer https://developers.arcgis.com/javascript/latest/sample-code/layers-custom-tilelayer/  and https://developers.arcgis.com/javascript/latest/sample-code/layers-webtile-3d/ and vector tile layer https://developers.arcgis.com/javascript/latest/sample-code/layers-vectortilelayer/  https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-VectorTileLayer.html have a button with a simple form to add URL and drop down for the type (vector tiles, raster tiles, terrain-elevation tiles).  look at this code as reference https://github.com/protomaps/PMTiles/tree/main/js as well as implementations in other mapping libraries like openlayers, leaflet and maplibre gl js.  We also want to be able to have popups for the vector tiles https://github.com/developmentseed/cached-vector-tile as well as Terrain-Elevation Values for the LERC2 terrain-elevation tiles and pixel RGBA values for the PNG/JPG/WEBP raster tiles. 

if this adds value use this as reference https://loaders.gl/docs/modules/mvt/api-reference/mvt-loader be able to support Mapzen Terrarium PNG Spec RGB Encoded heightmap terrain-elevation tiles and build 3D Mesh and 2D Spot elevation from this data this could be good reference https://loaders.gl/docs/modules/terrain/api-reference/terrain-loader https://github.com/mapzen/terrarium. here is an example PMTILES "terrain22":{"type":"vector","tiles":["pmtiles://https://data.source.coop/smartmaps/foil4gr1/terrain22.pmtiles/{z}/{x}/{y}.pbf"],"minzoom":9,"maxzoom":13,"attribution":"Terrain22"}}, https://github.com/optgeo/terrain22/blob/main/docs/style.json https://observablehq.com/d/15509f3ef76b3d58


please also add support for cloud native optimized format flatgeobuf vector GIS Data from a URL to add to the map https://loaders.gl/docs/modules/flatgeobuf/formats/flatgeobuf https://flatgeobuf.org/  https://github.com/flatgeobuf/flatgeobuf  https://guide.cloudnativegeo.org/flatgeobuf/intro.html

Please also support Cloud optimized geotiff COG url to add to the map https://developers.arcgis.com/javascript/latest/sample-code/layers-imagerytilelayer-cog/   https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-ImageryTileLayer.html

please create a search and filter widget and attribute table grid that works with OGC API Features with CQL Common Query Language Filtering. (GeoNode/GeoServer private secure mapping services so have a settings to enable URL and login information and keep that as secure and protected as possible)  Be able to do spatial filter to map view (bbox) or map center point lat long and buffer distance and return nearest records limited to 20 ordered by distance.  Be able to show the results on the map as a geojson layer. be able to select records/row on atttribute table and zoom to that record as well as configure popups from that data.  Please also create a search widget that works with OGC API Records and STAC API's and enables text searching, location filtering and by type and other parameters and be able to show query results on the map and have popups configured.

## Project setup
```
yarn install
```

### Compiles and hot-reloads for development
```
yarn serve
```

### Compiles and minifies for production
```
yarn build
```

### Lints and fixes files
```
yarn lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
