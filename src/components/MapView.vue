<template>
  <div class="map-container" ref="mapViewNode"></div>
</template>

<script>
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import BasemapToggle from "@arcgis/core/widgets/BasemapToggle.js";
import "@arcgis/core/assets/esri/themes/light/main.css";

export default {
  name: "MapView",
  mounted() {
    const map = new Map({
      basemap: "streets-navigation-vector", // You can change the basemap
    });

    const view = new MapView({
      container: this.$refs.mapViewNode,
      map: map,
      center: [-118.805, 34.027], // longitude, latitude
      zoom: 13,
    });

    const basemapToggle = new BasemapToggle({
      view: view,
      nextBasemap: "hybrid"
    });

    view.ui.add(basemapToggle, "bottom-right");

    // To avoid memory leaks, destroy the view when the component is unmounted
    this.$options.view = view;
  },
  beforeUnmount() {
    if (this.$options.view) {
      this.$options.view.destroy();
    }
  },
};
</script>

<style scoped>
.map-container {
  padding: 0;
  margin: 0;
  height: 100vh;
  width: 100vw;
}
</style>
