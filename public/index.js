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
let infoWindows = [];

let loading = true;
let secCount = UPDATE_INTERVAL_SEC;
let showControls = true;

let iconSize = 60;

async function InitializeMap()
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

    if (!isMobile())
    {
        map.addListener('click', MapClick);
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

    let routeDataResponse = await fetch('route-data');
    if (routeDataResponse.ok)
    {
        let routes = await routeDataResponse.json();
        routes.sort(CompareRoutes);
        routes.forEach(route =>
        {
            if (route.routeShortName === '99')
            {
                const routeToggleButtonNorth = document.createElement('button');
                routeToggleButtonNorth.textContent = route.routeShortName + ' - ' + "North";
                routeToggleButtonNorth.id = route.routeShortName;
                routeToggleButtonNorth.style.backgroundColor = '#' + route.routeColor;
                routeToggleButtonNorth.classList.add(CSS_CLASS_BUTTON);
                routeToggleButtonNorth.addEventListener('click', async () => await ToggleRoute(route, routeToggleButtonNorth));
                routeToggleButtonsDiv.appendChild(routeToggleButtonNorth);

                const routeToggleButtonSouth = document.createElement('button');
                routeToggleButtonSouth.textContent = route.routeShortName + ' - ' + "South";
                routeToggleButtonSouth.id = route.routeShortName;
                routeToggleButtonSouth.style.backgroundColor = '#' + route.routeColor;
                routeToggleButtonSouth.classList.add(CSS_CLASS_BUTTON);
                routeToggleButtonSouth.addEventListener('click', async () => await ToggleRoute(route, routeToggleButtonSouth));
                routeToggleButtonsDiv.appendChild(routeToggleButtonSouth);
            }
            else
            {
                const routeToggleButton = document.createElement('button');
                routeToggleButton.textContent = route.routeShortName + ' - ' + route.routeLongName;
                routeToggleButton.id = route.routeShortName;
                routeToggleButton.style.backgroundColor = '#' + route.routeColor;
                routeToggleButton.classList.add(CSS_CLASS_BUTTON);
                routeToggleButton.addEventListener('click', async () => await ToggleRoute(route, routeToggleButton));
                routeToggleButtonsDiv.appendChild(routeToggleButton);
            }
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

            alert.routeAndStopInfo.forEach(info =>
            {
                let affectedRouteAndStopText = document.createElement('p');
                affectedRouteAndStopText.innerText = '  ' + info.routeShortName + ': ' + info.stopName;
                alertsDiv.appendChild(affectedRouteAndStopText);
            });

            alertsDiv.appendChild(document.createElement('hr'));
        });
        
        map.controls[google.maps.ControlPosition.CENTER].push(alertsDiv);
    }
    
    if (isMobile())
    {
        iconSize = 100;
        map.setOptions({mapTypeControl: true, zoomControl: true, fullscreenControl: false});
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

function getBusIconData(bearing)
{
    let iconUrl = 'bus.png';
    let labelPos = (iconSize/2) - 2;
    let labelOrigin = new google.maps.Point(labelPos, labelPos);

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

    return { iconUrl: iconUrl, labelOrigin: labelOrigin };
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
        return !!selectedBtns.namedItem(labelText);
    }

    busPositions.forEach(bus =>
    {
        if (!shouldShowBus(bus))
        {
            return;
        }

        const busIconData = getBusIconData(bus.position.bearing);

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

        let marker = new google.maps.Marker(
        {
            position:
            {
                lat: bus.position.latitude,
                lng: bus.position.longitude
            },
            map: null,
            label:
            {
                text: labelText,
                fontWeight: 'bold',
                fontSize: labelFontSize,
                color: bus.routeColour
            },
            icon:
            {
                url: busIconData.iconUrl,
                labelOrigin: busIconData.labelOrigin,
                scaledSize: new google.maps.Size(iconSize, iconSize)
            }
        });

        let infoWindowText = document.createElement('h1');
        infoWindowText.innerText =  bus.tripHeadsign;
        infoWindowText.style = 'font-size:17px';

        let infoWindow = new google.maps.InfoWindow(
        {
            headerContent: infoWindowText,
        });

        marker.addListener('click', () =>
        {
            infoWindows.push(infoWindow);

            infoWindow.open(
            {
                anchor: marker,
                map,
            });
        });

        marker.setMap(map);
        busPositionMarkers.push(marker);
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
            DisplayStops(route, btn.textContent);
        }

        btn.classList.add(CSS_CLASS_SELECTED);
    }
    else
    {
        let displayedRouteIndex = displayedRoutes.findIndex(displayedRoute => displayedRoute.routeButtonText === btn.textContent);
        displayedRoutes[displayedRouteIndex].lines.forEach(line => line.setMap(null));
        displayedRoutes.splice(displayedRouteIndex, 1);

        if(showStops)
        {
            let displayedStopIndex = displayedStops.findIndex(displayedStopList => displayedStopList.routeButtonText === btn.textContent);
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

        displayedRoutes.forEach(displayedRoute => DisplayStops(displayedRoute.route, displayedRoute.routeButtonText));
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

async function DisplayStops(route, routeButtonText)
{
    let stopList = [];
    console.log(displayedStops);
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
            let marker = new google.maps.Marker(
            {
                position: { lat: stop.stopLat, lng: stop.stopLon },
                map,
                icon: 'marker.png',
            });

            let infoWindowText = document.createElement('h1')
            infoWindowText.innerText =  stop.stopName;
            infoWindowText.style = "font-size:17px";

            let infoWindow = new google.maps.InfoWindow(
            {
                headerContent: infoWindowText,
            }); 

            marker.addListener('click', () => 
            {
                infoWindows.push(infoWindow);

                infoWindow.open(
                {
                    anchor: marker,
                    map,
                });
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

        if (isMobile())
        {
            map.setOptions({mapTypeControl: true, zoomControl: true, fullscreenControl: false});
        }
        else
        {
            map.setOptions({mapTypeControl: true, zoomControl: true, fullscreenControl: true});
        }
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