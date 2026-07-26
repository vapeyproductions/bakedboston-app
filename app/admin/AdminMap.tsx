"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

type MapBakery = {
  id: number; name: string; address: string; latitude: number | null; longitude: number | null;
  recurringDays: string; readyTime: string; arrivalDeadline: string; active: boolean;
  contactName: string; contactEmail: string; contactPhone: string;
};
type MapPantry = {
  id: number; name: string; address: string; latitude: number | null; longitude: number | null;
  recurringDays: string; openTime: string; closeTime: string; latestArrival: string;
  deliveriesSevenDays: number; active: boolean; contactName: string; contactEmail: string; contactPhone: string;
};

type Props = {
  bakeries: MapBakery[];
  pantries: MapPantry[];
  showBakeries: boolean;
  showPantries: boolean;
  showRadius: boolean;
  day: string;
  time: string;
  bakeryMatches: (bakery: MapBakery, day: string, time: string) => boolean;
  pantryMatches: (pantry: MapPantry, day: string, time: string) => boolean;
};

export function milesBetween(a: { latitude: number | null; longitude: number | null }, b: { latitude: number | null; longitude: number | null }) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthMiles = 3958.7613;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const startLatitude = toRadians(a.latitude);
  const endLatitude = toRadians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function AdminMap({ bakeries, pantries, showBakeries, showPantries, showRadius, day, time, bakeryMatches, pantryMatches }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const mappedBakeries = useMemo(() => bakeries.filter((bakery) =>
    bakery.latitude != null && bakery.longitude != null && bakeryMatches(bakery, day, time)), [bakeries, bakeryMatches, day, time]);
  const mappedPantries = useMemo(() => pantries.filter((pantry) =>
    pantry.latitude != null && pantry.longitude != null && pantryMatches(pantry, day, time)), [pantries, pantryMatches, day, time]);

  const targetRadiusMiles = useMemo(() => {
    const allMappedBakeries = bakeries.filter((bakery) => bakery.latitude != null && bakery.longitude != null);
    const allMappedPantries = pantries.filter((pantry) => pantry.latitude != null && pantry.longitude != null);
    if (!allMappedBakeries.length || !allMappedPantries.length) return 0;
    const nearestDistances = allMappedPantries.map((pantry) => Math.min(...allMappedBakeries
      .map((bakery) => milesBetween(pantry, bakery))
      .filter((distance): distance is number => distance != null)));
    return nearestDistances.reduce((sum, distance) => sum + distance, 0) / nearestDistances.length;
  }, [bakeries, pantries]);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    void import("leaflet").then((module) => {
      if (disposed || !containerRef.current) return;
      const L = module.default;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const points = [...mappedBakeries, ...mappedPantries];
      const center: [number, number] = points.length
        ? [points.reduce((sum, point) => sum + Number(point.latitude), 0) / points.length,
          points.reduce((sum, point) => sum + Number(point.longitude), 0) / points.length]
        : [42.3601, -71.0589];
      const map = L.map(containerRef.current, { zoomControl: true }).setView(center, points.length ? 11 : 10);
      mapRef.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const bakeryIcon = L.divIcon({ className: "partnerMapIcon bakeryMapIcon", html: "<span>🥖</span>", iconSize: [34, 34], iconAnchor: [17, 17] });
      const pantryIcon = L.divIcon({ className: "partnerMapIcon pantryMapIcon", html: "<span>🥫</span>", iconSize: [34, 34], iconAnchor: [17, 17] });
      const highlightedBakeryIds = new Set<number>();
      if (showRadius && targetRadiusMiles > 0) {
        for (const pantry of mappedPantries) {
          L.circle([pantry.latitude!, pantry.longitude!], {
            radius: targetRadiusMiles * 1609.344,
            color: "#ef6548",
            fillColor: "#ef6548",
            fillOpacity: 0.08,
            weight: 2,
          }).addTo(map);
          for (const bakery of mappedBakeries) {
            const distance = milesBetween(pantry, bakery);
            if (distance != null && distance <= targetRadiusMiles) highlightedBakeryIds.add(bakery.id);
          }
        }
      }

      if (showPantries) {
        for (const pantry of mappedPantries) {
          L.marker([pantry.latitude!, pantry.longitude!], { icon: pantryIcon, title: pantry.name, alt: `Pantry: ${pantry.name}` })
            .bindPopup(`<strong>${escapeHtml(pantry.name)}</strong><br>${escapeHtml(pantry.address)}<br><small>Pantry</small>`).addTo(map);
        }
      }
      if (showBakeries) {
        for (const bakery of mappedBakeries) {
          const marker = L.marker([bakery.latitude!, bakery.longitude!], { icon: bakeryIcon, title: bakery.name, alt: `Bakery: ${bakery.name}` })
            .bindPopup(`<strong>${escapeHtml(bakery.name)}</strong><br>${escapeHtml(bakery.address)}<br><small>Bakery</small>`).addTo(map);
          marker.addTo(map);
          if (highlightedBakeryIds.has(bakery.id)) marker.getElement()?.classList.add("withinTarget");
        }
      }
      if (points.length > 1) {
        const bounds = L.latLngBounds(points.map((point) => [point.latitude!, point.longitude!] as [number, number]));
        map.fitBounds(bounds.pad(0.16));
      }
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mappedBakeries, mappedPantries, showBakeries, showPantries, showRadius, targetRadiusMiles]);

  return <div className="mapCanvasWrap">
    <div ref={containerRef} className="mapCanvas" />
    {!mappedBakeries.length && !mappedPantries.length && <div className="mapEmpty">No organizations with coordinates match these filters.</div>}
    <div className="mapLegend"><span>🥖 Bakery</span><span>🥫 Pantry</span>{showRadius && targetRadiusMiles > 0 && <span>Target radius: {targetRadiusMiles.toFixed(2)} mi</span>}</div>
  </div>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}
