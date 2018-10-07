import { Component, OnInit, ViewEncapsulation, AfterViewInit } from '@angular/core';
import * as mapboxgl from 'mapbox-gl';
import {environment} from '../../environments/environment';
import * as turf from '@turf/turf';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {getRandomString} from 'selenium-webdriver/safari';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class MapComponent implements AfterViewInit {

  map: mapboxgl.Map;
  style = 'mapbox://styles/shashank-sharma/cjmw1htq80a9w2smqgbyku1r4';
  lat = 28.684444;
  lng = 77.358338;
  warehouseLocation = [77.35172, 28.68234];
  truckLocation = [];


  public pointHopper: any = {};
  public keepTrack = [];
  public garbageIndex: any;
  public lastAtGarbage = 0;

  public warehouse = turf.featureCollection([turf.point(this.warehouseLocation)]);
  public dropoffs = turf.featureCollection([]);
  public nothing = turf.featureCollection([]);

  constructor(private http: HttpClient) {
    mapboxgl.accessToken = environment.mapbox.accessToken;
  }

  ngAfterViewInit() {

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(position => {
        this.lat = position.coords.latitude;
        this.lng = position.coords.longitude;
        this.map.flyTo({
          center: [this.lng, this.lat]
        });
        this.getRandomLocation();
        const marker = document.createElement('div');
        marker.classList.add('truck');

        // Create a new marker
        const truckMarker = new mapboxgl.Marker(marker)
          .setLngLat([this.lng, this.lat])
          .addTo(this.map);

        this.truckLocation = [this.lng, this.lat];
      });
    }

    this.map = new mapboxgl.Map({
      container: 'map',
      style: this.style,
      zoom: 15,
      center: [this.lng, this.lat]
    });

    this.map.on('load', () => {

      this.map.on('click', (e) => {
        // When the map is clicked, add a new drop-off point
        // and update the `dropoffs-symbol` layer
        this.newDropoff(this.map.unproject(e.point));
        this.updateDropoffs(this.dropoffs);
      });

      this.map.addSource('route', {
        type: 'geojson',
        data: this.nothing
      });

      this.map.addLayer({
        id: 'routeline-active',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3887be',
          'line-width': {
            base: 1,
            stops: [[12, 3], [22, 12]]
          }
        }
      }, 'road-label');

      this.map.addLayer({
        id: 'dropoffs-symbol',
        type: 'symbol',
        source: {
          data: this.dropoffs,
          type: 'geojson'
        },
        layout: {
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-image': 'marker-15',
        }
      });



      this.map.addLayer({
        id: 'warehouse',
        type: 'circle',
        source: {
          data: this.warehouse,
          type: 'geojson'
        },
        paint: {
          'circle-radius': 20,
          'circle-color': 'white',
          'circle-stroke-color': '#3887be',
          'circle-stroke-width': 3
        }
      });

      this.map.addLayer({
        id: 'warehouse-symbol',
        type: 'symbol',
        source: {
          data: this.warehouse,
          type: 'geojson'
        },
        layout: {
          'icon-image': 'town-hall-15',
          'icon-size': 1
        },
        paint: {
          'text-color': '#3887be'
        }
      });

      this.map.addLayer({
        id: 'routearrows',
        type: 'symbol',
        source: 'route',
        layout: {
          'symbol-placement': 'line',
          'text-field': '▶',
          'text-size': {
            base: 1,
            stops: [[12, 24], [22, 60]]
          },
          'symbol-spacing': {
            base: 1,
            stops: [[12, 30], [22, 160]]
          },
          'text-keep-upright': false
        },
        paint: {
          'text-color': '#3887be',
          'text-halo-color': 'hsl(55, 11%, 96%)',
          'text-halo-width': 3
        }
      }, 'road-label');

    });

  }

  newDropoff(coords) {
    // Store the clicked point as a new GeoJSON feature with
    // two properties: `orderTime` and `key`
    const pt = turf.point(
      [coords.lng, coords.lat],
      {
        orderTime: Date.now(),
        key: Math.random()
      }
    );
    this.dropoffs.features.push(pt);
    this.pointHopper[pt.properties.key] = pt;

    const httpOptions = {
    };

    this.http.get(this.assembleQueryURL(), httpOptions).subscribe((data: any) => {
      let routeGeoJSON = turf.featureCollection([turf.feature(data.trips[0].geometry)]);
      if (!data.trips[0]) {
        routeGeoJSON = this.nothing;
      } else {
        // Update the `route` source by getting the route source
        // and setting the data equal to routeGeoJSON
        this.map.getSource('route')
          .setData(routeGeoJSON);
      }

      if (data.waypoints.length === 12) {
        console.log('Maximum number of points reached. Read more at mapbox.com/api-documentation/#optimization.');
      }
    }, (error) => {
      console.log(error);
    });
  }

  updateDropoffs(geojson) {
    this.map.getSource('dropoffs-symbol')
      .setData(geojson);
  }

  assembleQueryURL() {

    // Store the location of the truck in a variable called coordinates
    const coordinates = [this.truckLocation];
    const distributions = [];
    this.keepTrack = [this.truckLocation];

    // Create an array of GeoJSON feature collections for each point
    const restJobs = this.objectToArray(this.pointHopper);

    // If there are actually orders from this garbage location
    if (restJobs.length > 0) {

      // Check to see if the request was made after visiting the garbage location
      const needToPickUp = restJobs.filter((d, i) => {
        return d.properties.orderTime > this.lastAtGarbage;
      }).length > 0;

      // If the request was made after picking up from the garbage location,
      // Add the garbage location as an additional stop
      if (needToPickUp) {
        this.garbageIndex = coordinates.length;
        // Add the garbage location as a coordinate
        // coordinates.push(this.warehouseLocation);
        // push the garbage location itself into the array
        this.keepTrack.push(this.pointHopper.warehouse);
      }

      restJobs.forEach((d, i) => {
        // Add dropoff to list
        this.keepTrack.push(d);
        coordinates.push(d.geometry.coordinates);
        // if order not yet picked up, add a reroute
        if (needToPickUp && d.properties.orderTime > this.lastAtGarbage) {
          distributions.push(this.garbageIndex + ',' + (coordinates.length - 1));
        }
      });
    }



    // Set the profile to `driving`
    // Coordinates will include the current location of the truck,
    return 'https://api.mapbox.com/optimized-trips/v1/mapbox/driving/' +
    coordinates.join(';') + ';' +
    this.warehouseLocation[0] + ',' +
    this.warehouseLocation[1] +
    '?overview=full&steps=true&annotations=duration,distance,speed&geometries=geojson&source=first&destination=last&roundtrip=false&access_token=' +
    mapboxgl.accessToken;
  }

  objectToArray(obj) {
    const keys = Object.keys(obj);
    const routeGeoJSON = keys.map(function(key) {
      return obj[key];
    });
    return routeGeoJSON;
  }

  getRandomLocation() {
    const randomLocation = [[28.687444, 77.358338], [28.687444, 77.354338], [28.687444, 77.351321], [28.68123, 77.352333]];
    for (let i = 0; i < randomLocation.length; i++) {
      setTimeout(() => {
      this.newDropoff({lng: randomLocation[i][1], lat: randomLocation[i][0]});
      this.updateDropoffs(this.dropoffs);
      }, 2000 + (i * 2000));
    }
  }


}
