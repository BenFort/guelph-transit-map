const CSS_CLASS_SELECTED = 'selected';
const CSS_CLASS_ROUNDCORNERS = 'rcorners';
const CSS_CLASS_BUTTONDIV = 'buttonDiv';
const CSS_CLASS_BUTTON = 'button';
const CSS_CLASS_TOGGLE_STOPS_BUTTON = 'toggleStopsButton';
const CSS_CLASS_BUTTON_ACTIVE = 'toggleStopsButtonActive';
const UPDATE_INTERVAL_SEC = 31;

let map;
let showStops = false;
let busPositionMarkers = [];
let displayedRoutes = [];
let displayedStops = [];
let busPositions = [];

let loading = true;
let secCount = UPDATE_INTERVAL_SEC;

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
        styles: styles['hide']
    });

    let countdownDiv = document.createElement('div');
    countdownDiv.classList.add(CSS_CLASS_ROUNDCORNERS);

    let heading = document.createElement('h1');
    heading.innerText =  'Guelph Transit Map';
    countdownDiv.appendChild(heading);
    
    countdownDiv.appendChild(document.createElement('br'));
    
    let countdown = document.createElement('h3');
    countdown.id = 'countdown';
    countdown.textContent = 'Loading...';
    countdownDiv.appendChild(countdown);
    
    countdownDiv.appendChild(document.createElement('hr'));

    let toggleStopsButton = document.createElement('button');
    toggleStopsButton.id = 'toggleStopsButton'
    toggleStopsButton.textContent = 'Show/Hide Bus Stops'
    toggleStopsButton.classList.add(CSS_CLASS_TOGGLE_STOPS_BUTTON);
    toggleStopsButton.addEventListener('click', ToggleStops);
    countdownDiv.appendChild(toggleStopsButton);
    
    map.controls[google.maps.ControlPosition.TOP_LEFT].push(countdownDiv);

    await UpdateBusPositionMarkers(true);

    let buttonDiv = document.createElement('div');
    buttonDiv.classList.add(CSS_CLASS_BUTTONDIV);

    response = await fetch('route-data');
    if (response.ok)
    {
        let routes = await response.json();
        routes.sort(CompareRoutes);
        routes.forEach(route =>
        {
            const newButton = document.createElement('button');
            newButton.textContent = route.routeShortName + ' - ' + route.routeLongName;
            newButton.style.backgroundColor = '#' + route.routeColor;
            newButton.id = route.routeShortName;
            newButton.classList.add(CSS_CLASS_BUTTON);
            newButton.addEventListener('click', async () => await ToggleRoute(route));
            buttonDiv.appendChild(newButton);
        });
        
        map.controls[google.maps.ControlPosition.BOTTOM_LEFT].push(buttonDiv);
        loading = false;
    }
    response = await fetch('alerts');

    if (response.ok)
    {
        let alerts = await response.json();
        alerts.forEach(alert =>
        {
            console.log(alert)
        });
    }
}

async function UpdateBusPositionMarkers(fetchNewData)
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
}

setInterval(async function()
{
    secCount--;
    if (secCount == 0)
    {
        await UpdateBusPositionMarkers(true);
        secCount = UPDATE_INTERVAL_SEC;
    }
    
    if (!loading)
    {
        document.getElementById('countdown').textContent = 'Next update in ' + secCount + ' seconds';
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
    
    await UpdateBusPositionMarkers(false);
}

function ToggleStops()
{
    showStops = !showStops;
    let toggleStopsButton = document.getElementById('toggleStopsButton');

    if(showStops)
    {
        toggleStopsButton.classList.add(CSS_CLASS_BUTTON_ACTIVE);
        
        displayedRoutes.forEach(displayedRoute =>
        {
            DisplayStops(displayedRoute.route);
        });
    }
    else
    {
        toggleStopsButton.classList.remove(CSS_CLASS_BUTTON_ACTIVE);
        
        displayedStops.forEach(displayedStop =>
        {
            displayedStop.stops.forEach(stop => stop.setMap(null));
        });
        displayedStops = [];
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
        const marker = new google.maps.Marker(
        {
            position: { lat: stop.stopLat, lng: stop.stopLon },
            map,
            icon: 'marker.png',
        });

        const infowindow = new google.maps.InfoWindow(
        {
            content: '<h1 style="font-size:17px">' + stop.stopName +'</h1>',
        });            

        map.addListener('click', function() 
        {
            if (infowindow) infowindow.close();
        });

        marker.addListener('click', () => 
        {
            infowindow.open(
            {
                anchor: marker,
                map,
            });
        });
            
        stopObj.stops.push(marker);
    });

    displayedStops.push(stopObj);
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