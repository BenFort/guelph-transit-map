const CSS_CLASS_SELECTED = 'selected';
const CSS_CLASS_ROUNDCORNERS = 'rcorners';
const CSS_CLASS_BUTTONDIV = 'buttonDiv';
const CSS_CLASS_ALERTSDIV = 'alertsDiv';
const CSS_CLASS_BUTTON = 'button';
const CSS_CLASS_TOGGLE_BUTTON = 'toggleButton';
const CSS_CLASS_TOGGLE_BUTTON_ACTIVE = 'toggleButtonActive';
const CSS_CLASS_CURRENT_LOCATION_BUTTON = 'currentLocationButton';
const CSS_CLASS_CURRENT_LOCATION_BUTTON_IMAGE = 'currentLocationButtonImage';
const CSS_CLASS_ALERTS_CLOSE_BUTTON = 'alertsCloseButton';
const UPDATE_INTERVAL_SEC = 31;

let map;
let showStops = false;
let showLocation = false;
let locationMarker;
let busPositionMarkers = [];
let displayedRoutes = [];
let displayedStops = [];
let busPositions = [];
let stopInfoWindows = [];

let loading = true;
let secCount = UPDATE_INTERVAL_SEC;
let showControls = true;

async function initMap()
{
    const styles =
    {
        default: [],
        hide:
        [
            {
                featureType: "poi.business",
                stylers: [{ visibility: "off" }],
            },
            {
                featureType: "transit",
                elementType: "labels.icon",
                stylers: [{ visibility: "off" }],
            }
        ]
    }; 

    map = new google.maps.Map(document.getElementById('map'),
    {
        zoom: 13,
        center: { lat: 43.538832, lng: -80.245294 },
        gestureHandling: 'greedy',
        mapTypeControl: true,
        mapTypeControlOptions:
        {
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.TOP_RIGHT
        },
        zoomControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
        streetViewControl: false,
        styles: styles['hide'],
        controlSize: 60
    });

    map.addListener('click', MapClick);

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

    map.controls[google.maps.ControlPosition.TOP_LEFT].push(siteControlsDiv);

    let currentLocationControlDiv = document.createElement('div');
    currentLocationControlDiv.id = 'currentLocationControl';
    currentLocationControlDiv.style.marginTop = '15px';

    let currentLocationButton = document.createElement('button');
    currentLocationButton.title = 'Display current location';
    currentLocationButton.classList.add(CSS_CLASS_CURRENT_LOCATION_BUTTON)
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
            locationMarker.setMap(null);
            currentLocationButtonImage.style.backgroundPosition = '0 0';
        }
    });

    map.controls[google.maps.ControlPosition.RIGHT_TOP].push(currentLocationControlDiv);

    let routeToggleButtonsDiv = document.createElement('div');
    routeToggleButtonsDiv.id = 'routeToggleButtonsDiv';
    routeToggleButtonsDiv.classList.add(CSS_CLASS_BUTTONDIV);

    let routes = [];
    let routeDataResponse = await fetch('route-data');
    if (routeDataResponse.ok)
    {
        routes = await routeDataResponse.json();
        routes.sort(CompareRoutes);
        routes.forEach(route =>
        {
            const routeToggleButton = document.createElement('button');
            routeToggleButton.textContent = route.routeShortName + ' - ' + route.routeLongName;
            routeToggleButton.style.backgroundColor = '#' + route.routeColor;
            routeToggleButton.id = route.routeShortName;
            routeToggleButton.classList.add(CSS_CLASS_BUTTON);
            routeToggleButton.addEventListener('click', async () => await ToggleRoute(route));
            routeToggleButtonsDiv.appendChild(routeToggleButton);
        });
        
        map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(routeToggleButtonsDiv);
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

            alert.affectedIdPairs.forEach(affectedIdPair =>
            {
                let affectedRoute = routes.find(route => route.routeId === affectedIdPair.routeId)
                let affectedStop = affectedRoute.routeStops.find(routeStop => routeStop.stopId === affectedIdPair.stopId)

                let affectedRouteText = document.createElement('p');
                affectedRouteText.innerText = '  ' + affectedRoute.routeShortName + ': ' + affectedStop.stopName;
                alertsDiv.appendChild(affectedRouteText);
            });

            alertsDiv.appendChild(document.createElement('hr'));
        });
        
        map.controls[google.maps.ControlPosition.CENTER].push(alertsDiv);
    }
    
    await UpdateMarkers(true);
    loading = false;
}

function ShowCurrentLocation(setMapCenter)
{
    document.getElementById('currentLocationButtonImage').style.backgroundPosition = '0 0';
    
    if (locationMarker)
    {
        locationMarker.setMap(null);
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
            
            locationMarker = new google.maps.Marker(
            {
                position: pos,
                map: map,
                icon:
                {
                    url: 'current_location.png'
                }
            });
            
            if (setMapCenter)
            {
                map.setCenter(pos);
                map.setZoom(16);
            }
            
            document.getElementById('currentLocationButtonImage').style.backgroundPosition = (-45 * 9) + 'px 0';
        });
    }
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
        marker.setMap(null);
    });
    busPositionMarkers = [];
    
    let selectedBtns = document.getElementsByClassName(CSS_CLASS_SELECTED);

    busPositions.forEach(bus =>
    {
        if (selectedBtns.namedItem(bus.routeShortName) || selectedBtns.length == 0)
        {
            busPositionMarkers.push(new google.maps.Marker(
            {
                position:
                {
                    lat: bus.position.latitude,
                    lng: bus.position.longitude
                },
                map: map,
                label:
                {
                    text: bus.routeShortName,
                    fontWeight: 'bold',
                    fontSize: bus.routeShortName.length > 2 ? '10px' : '17px'
                },
                icon:
                {
                    url: 'bus.png',
                    labelOrigin: new google.maps.Point(15, 12)
                }
            }));
        }
    });
    
    if (showLocation)
    {
        locationMarker.setMap(null);
        ShowCurrentLocation(false);
    }
}

setInterval(async function()
{
    secCount--;
    if (secCount == 0)
    {
        await UpdateMarkers(true);
        secCount = UPDATE_INTERVAL_SEC;
    }
    
    if (!loading)
    {
        document.getElementById('countdownHeading').textContent = 'Next update in ' + secCount + ' seconds';
    }
}, 1000);

function GenerateArrowIcons()
{
    const lineSymbol =
    {
        path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
    };

    let icons = [];
    let interval = 100 / 10;
    for (let i = interval; i < 100; i += interval)
    {
        icons.push({ icon: lineSymbol, offset: i + '%' });
    }
    return icons;
}

async function ToggleRoute(route)
{
    const btn = document.getElementById(route.routeShortName)

    if (!btn.classList.contains(CSS_CLASS_SELECTED))
    {
        let response = await fetch('shape-coords-for-route-id?' + new URLSearchParams({ routeId: route.routeId }));
        let coordSetList = [];
        if (response.ok)
        {
            coordSetList = await response.json();
        }

        let routeObj =
        {
            route: route,
            lines: []
        };
        
        coordSetList.forEach(coordSet => routeObj.lines.push(new google.maps.Polyline(
        {
            path: coordSet,
            icons: GenerateArrowIcons(),
            map: map,
            strokeColor: '#' + route.routeColor
        })));

        displayedRoutes.push(routeObj);

        if(showStops)
        {
            DisplayStops(route);
        }

        btn.classList.add(CSS_CLASS_SELECTED);
    }
    else
    {
        let displayedRouteIndex = displayedRoutes.findIndex(displayedRoute => displayedRoute.route.routeId == route.routeId);
        displayedRoutes[displayedRouteIndex].lines.forEach(line => line.setMap(null));
        displayedRoutes.splice(displayedRouteIndex, 1);

        if(showStops)
        {
            let displayedStopIndex = displayedStops.findIndex(displayedStopList => displayedStopList.routeId == route.routeId);
            displayedStops[displayedStopIndex].stops.forEach(stop => stop.setMap(null));
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
        
        displayedRoutes.forEach(displayedRoute => DisplayStops(displayedRoute.route));
    }
    else
    {
        toggleStopsButton.classList.remove(CSS_CLASS_TOGGLE_BUTTON_ACTIVE);
        
        displayedStops.forEach(displayedStop => displayedStop.stops.forEach(stop => stop.setMap(null)));
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

function DisplayStops(route)
{
    let stopObj = 
    {
        routeId: route.routeId,
        stops: []
    };

    route.routeStops.forEach(stop => 
    {
        let marker = new google.maps.Marker(
        {
            position: { lat: stop.stopLat, lng: stop.stopLon },
            map,
            icon: 'marker.png',
        });

        let infoWindow = new google.maps.InfoWindow(
        {
            content: '<h1 style="font-size:17px">' + stop.stopName + '</h1>',
        });            

        marker.addListener('click', () => 
        {
            stopInfoWindows.push(infoWindow);

            infoWindow.open(
            {
                anchor: marker,
                map,
            });
        });
            
        stopObj.stops.push(marker);
    });

    displayedStops.push(stopObj);
}

function MapClick()
{
    if (stopInfoWindows.length != 0)
    {
        stopInfoWindows.forEach(stopInfoWindow => stopInfoWindow.close());
        stopInfoWindows = [];
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
        map.setOptions({mapTypeControl: true, zoomControl: true, fullscreenControl: true});
    }
    else
    {
        document.getElementById('siteControlsDiv').classList.add('hidden');
        document.getElementById('routeToggleButtonsDiv').classList.add('hidden');
        document.getElementById('currentLocationControl').classList.add('hidden');
        map.setOptions({mapTypeControl: false, zoomControl: false, fullscreenControl: false});
    }
}

function CompareRoutes(routeA, routeB)
{
    let routeA_num = Number(routeA.routeShortName);
    let routeB_num = Number(routeB.routeShortName);
    
    if (routeA_num == 99)
    {
        return Number.MIN_SAFE_INTEGER;
    }
    else if (routeB_num == 99)
    {
        return Number.MAX_SAFE_INTEGER;
    }
    else if (routeA_num != NaN && routeB_num != NaN)
    {
        return routeA_num - routeB_num;
    }
    else
    {
        return routeA.routeShortName.localeCompare(routeB.routeShortName);
    }
}