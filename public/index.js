const CSS_CLASS_SELECTED = 'selected';
const CSS_CLASS_ROUNDCORNERS = 'rcorners';
const CSS_CLASS_BUTTONDIV = 'buttonDiv';
const CSS_CLASS_ALERTSDIV = 'alertsDiv';
const CSS_CLASS_BUTTON = 'button';
const CSS_CLASS_TOGGLE_BUTTON = 'toggleButton';
const CSS_CLASS_TOGGLE_BUTTON_ACTIVE = 'toggleButtonActive';
const CSS_CLASS_MAP_CONTROL_BUTTON = 'mapControlButton';
const CSS_CLASS_CURRENT_LOCATION_BUTTON_IMAGE = 'currentLocationButtonImage';
const CSS_CLASS_ALERTS_CLOSE_BUTTON = 'alertsCloseButton';
const CSS_CLASS_MAP_TYPE_CONTROL = 'mapTypeControl';
const CSS_CLASS_MAP_TYPE_BUTTON_ACTIVE = 'mapTypeButtonActive';
const UPDATE_INTERVAL_SEC = 31;
const INFO_WINDOW_OPTIONS = { autoClose: false, closeOnClick: false };
const SHOWN_POI_CLASSES = ['park', 'school', 'college', 'hospital'];
const SHOWN_TRANSIT_CLASSES = ['airport', 'rail'];

let map;
let showStops = false;
let showLocation = false;
let locationMarker;
let busPositionMarkers = [];
let displayedRoutes = [];
let displayedStops = [];
let busPositions = [];
let infoWindows = [];

let loading = true;
let secCount = UPDATE_INTERVAL_SEC;
let showControls = true;

let iconSize = 60;

async function InitializeMap()
{
    map = L.map('map',
    {
        zoom: 13,
        center: { lat: 43.538832, lng: -80.245294 },
        zoomControl: false
    });

    map.attributionControl.setPrefix(false);

    let streetLayer = L.maplibreGL(
    {
        style: 'https://tiles.openfreemap.org/styles/bright',
        attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });

    // The MapLibre map is rebuilt each time this layer is added, so the filters are reapplied here
    streetLayer.on('add', () => AdjustMapLabels(streetLayer.getMaplibreMap()));
    streetLayer.addTo(map);

    let satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics'
    });

    AddMapControl(CreateMapTypeControl(streetLayer, satelliteLayer), 'topright');

    if (!isMobile())
    {
        map.on('click', MapClick);
    }

    let siteControlsDiv = document.createElement('div');
    siteControlsDiv.id = 'siteControlsDiv';
    siteControlsDiv.classList.add(CSS_CLASS_ROUNDCORNERS);

    let titleHeading = document.createElement('h1');
    titleHeading.innerText =  'Guelph Transit Map';
    siteControlsDiv.appendChild(titleHeading);
    
    siteControlsDiv.appendChild(document.createElement('br'));
    
    let countdownHeading = document.createElement('h3');
    countdownHeading.id = 'countdownHeading';
    countdownHeading.textContent = 'Loading...';
    siteControlsDiv.appendChild(countdownHeading);
    
    siteControlsDiv.appendChild(document.createElement('hr'));

    let toggleStopsButton = document.createElement('button');
    toggleStopsButton.id = 'toggleStopsButton'
    toggleStopsButton.textContent = 'Show/Hide Bus Stops'
    toggleStopsButton.classList.add(CSS_CLASS_TOGGLE_BUTTON);
    toggleStopsButton.addEventListener('click', ToggleStops);
    siteControlsDiv.appendChild(toggleStopsButton);
    
    let toggleAlertsButton = document.createElement('button');
    toggleAlertsButton.id = 'toggleAlertsButton';
    toggleAlertsButton.textContent = 'View Alerts';
    toggleAlertsButton.classList.add(CSS_CLASS_TOGGLE_BUTTON);
    toggleAlertsButton.addEventListener('click', ToggleAlerts);
    siteControlsDiv.appendChild(toggleAlertsButton);

    let aboutButton = document.createElement('button');
    aboutButton.id = 'aboutButton';
    aboutButton.textContent = 'About';
    aboutButton.classList.add(CSS_CLASS_TOGGLE_BUTTON);
    aboutButton.addEventListener('click', function() { document.getElementById('aboutDialog').showModal(); });
    siteControlsDiv.appendChild(aboutButton);

    // About dialog
    let aboutDialog = document.createElement('dialog');
    aboutDialog.id = 'aboutDialog';
    aboutDialog.classList.add('aboutDialog');
    
    aboutDialog.innerHTML = `
        <h3 class="aboutDialogTitle">About</h3>
        <p class="aboutDialogBody">Guelph Transit Map is an open source hobby project developed primarily by Ben Fortin and Michael. We can be reached at <a href="mailto:support@guelph-transit-map.ca">support@guelph-transit-map.ca</a></p>
        <p class="aboutDialogBody">We aren't associated in any official capacity with the City of Guelph. The site was developed using data obtained through <a href="https://explore.guelph.ca/pages/transit-gtfs-data">Guelph's Open Data Portal</a>.</p>
        <p class="aboutDialogBody">Check out the <a href="https://github.com/BenFort/guelph-transit-map">GitHub repository</a></p>
        <p class="aboutDialogBody"><a href="https://ko-fi.com/mrusse">Donate to support the project</a></p>
        <div class="aboutDialogFooter">
            <button id="aboutDialogClose" class="toggleButton">Close</button>
        </div>`;
    document.body.appendChild(aboutDialog);
    document.getElementById('aboutDialogClose').addEventListener('click', function() { document.getElementById('aboutDialog').close(); });

    AddMapControl(siteControlsDiv, 'topleft');

    let fullscreenControlDiv = document.createElement('div');
    fullscreenControlDiv.id = 'fullscreenControl';

    let fullscreenButton = document.createElement('button');
    fullscreenButton.title = 'Toggle fullscreen view';
    fullscreenButton.classList.add(CSS_CLASS_MAP_CONTROL_BUTTON);
    fullscreenButton.innerHTML = '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#666" stroke-width="2.5"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
    fullscreenButton.addEventListener('click', function ()
    {
        if (document.fullscreenElement)
        {
            document.exitFullscreen();
        }
        else
        {
            document.getElementById('map').requestFullscreen();
        }
    });
    fullscreenControlDiv.appendChild(fullscreenButton);

    AddMapControl(fullscreenControlDiv, 'topright');

    let currentLocationControlDiv = document.createElement('div');
    currentLocationControlDiv.id = 'currentLocationControl';

    let currentLocationButton = document.createElement('button');
    currentLocationButton.title = 'Display current location';
    currentLocationButton.classList.add(CSS_CLASS_MAP_CONTROL_BUTTON)
    currentLocationControlDiv.appendChild(currentLocationButton);

    let currentLocationButtonImage = document.createElement('div');
    currentLocationButtonImage.id = 'currentLocationButtonImage'
    currentLocationButtonImage.classList.add(CSS_CLASS_CURRENT_LOCATION_BUTTON_IMAGE);
    currentLocationButton.appendChild(currentLocationButtonImage);

    currentLocationButton.addEventListener('click', function ()
    {
        showLocation = !showLocation;
        if (showLocation)
        {
            ShowCurrentLocation(true)
        }
        else
        {
            locationMarker.remove();
            currentLocationButtonImage.style.backgroundPosition = '0 0';
        }
    });

    AddMapControl(currentLocationControlDiv, 'topright');

    let zoomControl = L.control.zoom({ position: 'topright' }).addTo(map);
    zoomControl.getContainer().id = 'zoomControl';

    let routeToggleButtonsDiv = document.createElement('div');
    routeToggleButtonsDiv.id = 'routeToggleButtonsDiv';
    routeToggleButtonsDiv.classList.add(CSS_CLASS_BUTTONDIV);

    let routeDataResponse = await fetch('route-data');
    if (routeDataResponse.ok)
    {
        let routes = await routeDataResponse.json();
        routes.sort(CompareRoutes);
        routes.forEach(route =>
        {
            if (route.routeShortName === '99') 
            {
                createRouteToggleButton(route, `${route.routeShortName} - North`, routeToggleButtonsDiv);
                createRouteToggleButton(route, `${route.routeShortName} - South`, routeToggleButtonsDiv);
            } 
            else 
            {
                createRouteToggleButton(route, `${route.routeShortName} - ${route.routeLongName}`, routeToggleButtonsDiv);
            }
        });
        
        AddMapOverlay(routeToggleButtonsDiv);
    }
    
    let alertsDiv = document.createElement('div');
    alertsDiv.id = 'alertsDiv';
    alertsDiv.classList.add(CSS_CLASS_ALERTSDIV);

    let alertsCloseButton = document.createElement('button');
    alertsCloseButton.id = 'alertsCloseButton';
    alertsCloseButton.textContent = 'X';
    alertsCloseButton.addEventListener('click', ToggleAlerts);
    alertsCloseButton.classList.add(CSS_CLASS_ALERTS_CLOSE_BUTTON);
    alertsDiv.appendChild(alertsCloseButton);
    alertsDiv.hidden = true;
    
    response = await fetch('alerts');
    if (response.ok)
    {
        let alerts = await response.json();
        alerts.forEach(alert =>
        {
            let alertType = document.createElement('h1');
            alertType.innerText = alert.alertType + ':';
            alertsDiv.appendChild(alertType);
            
            alertsDiv.appendChild(document.createElement('br'));

            let alertText = document.createElement('h2');
            alertText.innerText =  alert.descriptionText;
            alertsDiv.appendChild(alertText);
            
            alertsDiv.appendChild(document.createElement('br'));

            let alertActivePeriod = document.createElement('p');
            alertActivePeriod.innerText =  'Active from: ' + alert.activePeriod.start + ' - ' + alert.activePeriod.end;
            alertsDiv.appendChild(alertActivePeriod);
            
            alertsDiv.appendChild(document.createElement('br'));

            let affectedRoutes = document.createElement('h4');
            affectedRoutes.innerText =  'Affected Routes / Stops:';
            alertsDiv.appendChild(affectedRoutes);
            
            alertsDiv.appendChild(document.createElement('br'));

            alert.routeAndStopInfo.forEach(info =>
            {
                let affectedRouteAndStopText = document.createElement('p');
                affectedRouteAndStopText.innerText = '  ' + info.routeShortName + ': ' + info.stopName;
                alertsDiv.appendChild(affectedRouteAndStopText);
            });

            alertsDiv.appendChild(document.createElement('hr'));
        });
        
        AddMapOverlay(alertsDiv);
    }
    
    if (isMobile())
    {
        iconSize = 100;
        fullscreenControlDiv.classList.add('hidden');
    }

    await UpdateMarkers(true);
    loading = false;
}

function AdjustMapLabels(maplibreMap)
{
    maplibreMap.once('style.load', () =>
    {
        ['poi_r1', 'poi_r7', 'poi_r20'].forEach(layerId =>
        {
            maplibreMap.setFilter(layerId, ['all', maplibreMap.getFilter(layerId), ['in', ['get', 'class'], ['literal', SHOWN_POI_CLASSES]]]);
        });

        maplibreMap.setFilter('poi_transit', ['in', ['get', 'class'], ['literal', SHOWN_TRANSIT_CLASSES]]);

        // Show main street names at the default zoom. MapLibre zoom is one less than Leaflet zoom
        maplibreMap.setLayerZoomRange('highway-name-major', 11, 24);

        ['highway-name-major', 'highway-name-minor', 'highway-name-path'].forEach(layerId =>
        {
            maplibreMap.setLayoutProperty(layerId, 'text-size', ['interpolate', ['linear'], ['zoom'], 12, 13, 16, 16]);
            maplibreMap.setPaintProperty(layerId, 'text-color', '#222');
            maplibreMap.setPaintProperty(layerId, 'text-halo-color', '#fff');
            maplibreMap.setPaintProperty(layerId, 'text-halo-width', 2);
        });
    });
}

function StopMapEvents(div)
{
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
}

function AddMapControl(div, position)
{
    StopMapEvents(div);

    let control = L.control({ position: position });
    control.onAdd = () => div;
    control.addTo(map);
}

// Leaflet has no centred control positions, so these are placed by CSS instead
function AddMapOverlay(div)
{
    StopMapEvents(div);
    map.getContainer().appendChild(div);
}

function CreateMapTypeControl(streetLayer, satelliteLayer)
{
    let mapTypeControlDiv = document.createElement('div');
    mapTypeControlDiv.id = 'mapTypeControl';
    mapTypeControlDiv.classList.add(CSS_CLASS_MAP_TYPE_CONTROL);

    let streetButton = document.createElement('button');
    streetButton.textContent = 'Map';
    streetButton.classList.add(CSS_CLASS_MAP_TYPE_BUTTON_ACTIVE);
    mapTypeControlDiv.appendChild(streetButton);

    let satelliteButton = document.createElement('button');
    satelliteButton.textContent = 'Satellite';
    mapTypeControlDiv.appendChild(satelliteButton);

    function SelectMapType(activeButton, inactiveButton, activeLayer, inactiveLayer)
    {
        inactiveLayer.remove();
        activeLayer.addTo(map);
        activeButton.classList.add(CSS_CLASS_MAP_TYPE_BUTTON_ACTIVE);
        inactiveButton.classList.remove(CSS_CLASS_MAP_TYPE_BUTTON_ACTIVE);
    }

    streetButton.addEventListener('click', () => SelectMapType(streetButton, satelliteButton, streetLayer, satelliteLayer));
    satelliteButton.addEventListener('click', () => SelectMapType(satelliteButton, streetButton, satelliteLayer, streetLayer));

    return mapTypeControlDiv;
}

function createRouteToggleButton(route, label, routeToggleButtonsDiv) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.id = route.routeShortName;
    btn.style.backgroundColor = '#' + route.routeColor;
    btn.classList.add(CSS_CLASS_BUTTON);
    btn.addEventListener('click', async () => await ToggleRoute(route, btn));
    routeToggleButtonsDiv.appendChild(btn);
}

function ShowCurrentLocation(setMapCenter)
{
    document.getElementById('currentLocationButtonImage').style.backgroundPosition = '0 0';
    
    if (locationMarker)
    {
        locationMarker.remove();
    }

    if (navigator.geolocation)
    {
        navigator.geolocation.getCurrentPosition(position =>
        {
            let pos =
            {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            locationMarker = L.marker(pos,
            {
                icon: L.icon({ iconUrl: 'current_location.png', iconSize: [30, 30], iconAnchor: [15, 30] })
            }).addTo(map);
            
            if (setMapCenter)
            {
                map.setView(pos, 16);
            }
            
            document.getElementById('currentLocationButtonImage').style.backgroundPosition = (-45 * 9) + 'px 0';
        },
        error =>
        {
            showLocation = false;
            alert('Could not get your location: ' + error.message);
        },
        { timeout: 15000 });
    }
}

function getBusIconUrl(bearing)
{
    let iconUrl = 'bus.png';

    //North
    if (337.5 < bearing || bearing <= 22.5)
    {
        iconUrl = 'bus-north.png';
    }
    //Northeast
    else if (22.5 < bearing && bearing <= 67.5)
    {
        iconUrl = 'bus-northeast.png';
    }
    //East
    else if (67.5 < bearing && bearing <= 112.5) 
    {
        iconUrl = 'bus-east.png';
    }
    //Southeast
    else if (112.5 < bearing && bearing <= 157.5)
    {
        iconUrl = 'bus-southeast.png';
    }
    //South
    else if (157.5 < bearing && bearing <= 202.5)
    {
        iconUrl = 'bus-south.png';
    }
    //Southwest
    else if (202.5 < bearing && bearing <= 247.5)
    {
        iconUrl = 'bus-southwest.png';
    }
    //West
    else if (247.5 < bearing && bearing <= 292.5)
    {
        iconUrl = 'bus-west.png';
    }
    //Northwest
    else if (292.5 < bearing && bearing <= 337.5)
    {
        iconUrl = 'bus-northwest.png';
    }
    else if (bearing === undefined)
    {
        console.log('Could not determine direction of bus with undefined bearing');
    }
    else
    {
        console.warn(`Could not determine directional icon for bearing ${bearing}`);
    }

    return iconUrl;
}

async function UpdateMarkers(fetchNewData)
{
    if (fetchNewData)
    {
        let response = await fetch('bus-positions');
        if (response.ok)
        {
            busPositions = await response.json();
        }
    }

    busPositionMarkers.forEach(marker =>
    {
        marker.remove();
    });
    busPositionMarkers = [];

    const selectedBtns = document.getElementsByClassName(CSS_CLASS_SELECTED);

    function shouldShowBus(bus)
    {
        if (selectedBtns.length === 0) return true;

        const labelText = (bus.routeShortName ?? "").toString();
        if (labelText === "99")
        {
            const parts = (bus.tripHeadsign || "").split(" ");
            const suffix = (parts.length > 2) ? parts[2].charAt(0) : "";

            if (suffix === "N")
            {
                for (const btn of selectedBtns)
                {
                    if (btn.innerText === "99 - North") return true;
                }
                return false;
            }

            if (suffix === "S")
            {
                for (const btn of selectedBtns)
                {
                    if (btn.innerText === "99 - South") return true;
                }
                return false;
            }

            for (const btn of selectedBtns)
            {
                if (btn.innerText.startsWith("99 -")) return true;
            }
            return false;
        }
        return selectedBtns.namedItem(labelText);
    }

    busPositions.forEach(bus =>
    {
        if (!shouldShowBus(bus))
        {
            return;
        }

        const busIconUrl = getBusIconUrl(bus.position.bearing);

        let labelText = bus.routeShortName;
        if (labelText === '99')
        {
            let splitHeadsign = bus.tripHeadsign.split(' ');

            if (splitHeadsign.length > 2)
            {
                labelText += bus.tripHeadsign.split(' ')[2].charAt(0);
            }
        }

        let labelFontSize = labelText.length > 2 ? '10px' : '17px';
        if (isMobile())
        {
            labelFontSize = labelText.length > 2 ? '17px' : '24px';
        }

        let markerContent = document.createElement('div');
        markerContent.textContent = labelText;
        markerContent.style.backgroundImage = `url(${busIconUrl})`;
        markerContent.style.fontSize = labelFontSize;
        markerContent.style.color = '#' + bus.routeColour;

        let marker = L.marker(
        {
            lat: bus.position.latitude,
            lng: bus.position.longitude
        },
        {
            icon: L.divIcon(
            {
                html: markerContent,
                className: 'busMarker',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize],
                popupAnchor: [0, -iconSize]
            })
        });

        let infoWindowText = document.createElement('h1');
        infoWindowText.innerText =  bus.tripHeadsign;
        infoWindowText.style = 'font-size:17px';

        marker.bindPopup(infoWindowText, INFO_WINDOW_OPTIONS);

        marker.on('click', () =>
        {
            infoWindows.push(marker.getPopup());
        });

        marker.addTo(map);
        busPositionMarkers.push(marker);
    });

    if (showLocation)
    {
        ShowCurrentLocation(false);
    }
}

document.addEventListener('DOMContentLoaded', InitializeMap);

setInterval(async function()
{
    secCount--;
    if (secCount <= 0)
    {
        secCount = UPDATE_INTERVAL_SEC;
        await UpdateMarkers(true);
    }
    
    if (!loading)
    {
        document.getElementById('countdownHeading').textContent = 'Next update in ' + secCount + ' seconds';
    }
}, 1000);

function GenerateArrows(line)
{
    return L.polylineDecorator(line,
    {
        patterns:
        [
            {
                offset: '10%',
                endOffset: '10%',
                repeat: '10%',
                symbol: L.Symbol.arrowHead(
                {
                    pixelSize: 9,
                    polygon: false,
                    pathOptions: { color: line.options.color, weight: 3, opacity: 1 }
                })
            }
        ]
    }).addTo(map);
}

async function ToggleRoute(route, btn)
{
    if (!btn.classList.contains(CSS_CLASS_SELECTED))
    {
        let response = await fetch('shape-coords-for-route-id?' + new URLSearchParams({ routeId: route.routeId , routeButtonText: btn.textContent}));
        let coordSetList = [];
        if (response.ok)
        {
            coordSetList = await response.json();
        }

        let routeObj =
        {
            route: route,
            routeButtonText: btn.textContent,
            lines: []
        };
        
        coordSetList.forEach(coordSet =>
        {
            let line = L.polyline(coordSet, { color: '#' + route.routeColor, weight: 3, opacity: 1 }).addTo(map);
            routeObj.lines.push(line, GenerateArrows(line));
        });

        displayedRoutes.push(routeObj);

        if(showStops)
        {
            DisplayStops(route, btn.textContent);
        }

        btn.classList.add(CSS_CLASS_SELECTED);
    }
    else
    {
        let displayedRouteIndex = displayedRoutes.findIndex(displayedRoute => displayedRoute.routeButtonText === btn.textContent);
        displayedRoutes[displayedRouteIndex].lines.forEach(line => line.remove());
        displayedRoutes.splice(displayedRouteIndex, 1);

        if(showStops)
        {
            let displayedStopIndex = displayedStops.findIndex(displayedStopList => displayedStopList.routeButtonText === btn.textContent);
            displayedStops[displayedStopIndex].stops.forEach(stop => stop.remove());
            displayedStops.splice(displayedStopIndex, 1);
        }

        btn.classList.remove(CSS_CLASS_SELECTED);
    }
    
    await UpdateMarkers(false);
}

function ToggleStops()
{
    showStops = !showStops;
    let toggleStopsButton = document.getElementById('toggleStopsButton');

    if(showStops)
    {
        toggleStopsButton.classList.add(CSS_CLASS_TOGGLE_BUTTON_ACTIVE);

        displayedRoutes.forEach(displayedRoute => DisplayStops(displayedRoute.route, displayedRoute.routeButtonText));
    }
    else
    {
        toggleStopsButton.classList.remove(CSS_CLASS_TOGGLE_BUTTON_ACTIVE);
        
        displayedStops.forEach(displayedStop => displayedStop.stops.forEach(stop => stop.remove()));
        displayedStops = [];
    }
}

function ToggleAlerts()
{
    ToggleMapControls();

    let alertsDiv = document.getElementById('alertsDiv');
    if(alertsDiv.hidden)
    {
        alertsDiv.hidden = false;
    }
    else
    {
        alertsDiv.hidden = true;
    }
}

async function DisplayStops(route, routeButtonText)
{
    let stopList = [];
    let isRoute99 = false;

    let stopObj = 
    {
        routeId: route.routeId,
        routeButtonText: routeButtonText,
        stops: []
    };

    if (routeButtonText === "99 - North")
    {
        stopList = await GetStopIdsForTripHeadsign("99 Mainline Northbound");
        isRoute99 = true;

    }
    if (routeButtonText === "99 - South")
    {
        stopList = await GetStopIdsForTripHeadsign("99 Mainline Southbound");
        isRoute99 = true;
    }

    route.routeStops.forEach(stop => 
    {
        if (isRoute99 && !stopList.includes(stop.stopId))
        {
            return;
        }
        else
        {
            let marker = L.marker({ lat: stop.stopLat, lng: stop.stopLon },
            {
                icon: L.icon({ iconUrl: 'marker.png', iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -36] })
            }).addTo(map);

            let infoWindowText = document.createElement('h1')
            infoWindowText.innerText =  stop.stopName;
            infoWindowText.style = "font-size:17px";

            marker.bindPopup(infoWindowText, INFO_WINDOW_OPTIONS);

            marker.on('click', () =>
            {
                infoWindows.push(marker.getPopup());
            });

            stopObj.stops.push(marker);   
        }
    });

    displayedStops.push(stopObj);
}

function MapClick()
{
    if (infoWindows.length !== 0)
    {
        infoWindows.forEach(infoWindow => infoWindow.close());
        infoWindows = [];
    }
    else
    {
        ToggleMapControls();
    }
}

function ToggleMapControls()
{
    showControls = !showControls;
    if (showControls)
    {
        document.getElementById('siteControlsDiv').classList.remove('hidden');
        document.getElementById('routeToggleButtonsDiv').classList.remove('hidden');
        document.getElementById('currentLocationControl').classList.remove('hidden');
        document.getElementById('mapTypeControl').classList.remove('hidden');
        document.getElementById('zoomControl').classList.remove('hidden');

        if (!isMobile())
        {
            document.getElementById('fullscreenControl').classList.remove('hidden');
        }
    }
    else
    {
        document.getElementById('siteControlsDiv').classList.add('hidden');
        document.getElementById('routeToggleButtonsDiv').classList.add('hidden');
        document.getElementById('currentLocationControl').classList.add('hidden');
        document.getElementById('mapTypeControl').classList.add('hidden');
        document.getElementById('zoomControl').classList.add('hidden');
        document.getElementById('fullscreenControl').classList.add('hidden');
    }
}

function CompareRoutes(routeA, routeB)
{
    let routeA_num = Number(routeA.routeShortName);
    let routeB_num = Number(routeB.routeShortName);
    
    if (routeA_num === 99)
    {
        return Number.MIN_SAFE_INTEGER;
    }
    else if (routeB_num === 99)
    {
        return Number.MAX_SAFE_INTEGER;
    }
    else if (routeA_num !== NaN && routeB_num !== NaN)
    {
        return routeA_num - routeB_num;
    }
    else
    {
        return routeA.routeShortName.localeCompare(routeB.routeShortName);
    }
}

async function GetStopIdsForTripHeadsign(tripHeadsign)
{
    const response = await fetch('stop-ids-for-trip-headsign?' + new URLSearchParams({ tripHeadsign }));

    if (!response.ok)
    {
        throw new Error('Failed to fetch stop IDs');
    }

    return await response.json();
}

function isMobile()
{
    return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}