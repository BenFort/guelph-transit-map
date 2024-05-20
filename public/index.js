const CSS_CLASS_SELECTED = 'selected';
const CSS_CLASS_ROUNDCORNERS = 'rcorners';
const CSS_CLASS_BUTTONDIV = 'buttonDiv';
const CSS_CLASS_BUTTON = 'button';
const CSS_CLASS_SETTINGS = 'settingsButton';
const CSS_CLASS_SETACTIVE = 'settingsButtonActive';
const UPDATE_INTERVAL_SEC = 31;

let map;
let showStops = false;
let markers = [];
let displayedRoutes = [];
let displayedStops = [];
let buses = [];

async function initMap()
{
    const styles = 
    {
        default: [],
        hide: [
        {
            featureType: "poi.business",
            stylers: [{ visibility: "off" }],
        },
        {
            featureType: "transit",
            elementType: "labels.icon",
            stylers: [{ visibility: "off" }],
        },
        ],
    }; 

    map = new google.maps.Map(document.getElementById('map'),
    {
        zoom: 13,
        center: { lat: 43.538832, lng: -80.245294 },
        gestureHandling: 'greedy',
        mapTypeControl: true,
        mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.TOP_RIGHT
        },
        zoomControlOptions: {
            position: google.maps.ControlPosition.TOP_RIGHT
        },
        streetViewControl: false,
        styles: styles["hide"]
    });     

    await UpdateBusPositionMarkers(true);

    response = await fetch('route-data');
    if (response.ok)
    {
        let buttonDiv = document.createElement('div');
        let countdownDiv = document.createElement('div');
        let heading = document.createElement('h1');
        let countdown = document.createElement('h3');
        let settingsButton = document.createElement('button');

        heading.innerText =  "Guelph Transit Map";
        countdown.id = "countdown"
        countdownDiv.appendChild(heading);
        countdownDiv.appendChild(document.createElement('br'));
        countdownDiv.appendChild(countdown);
        buttonDiv.classList.add(CSS_CLASS_BUTTONDIV);
        countdownDiv.classList.add(CSS_CLASS_ROUNDCORNERS);

        settingsButton.id = "settingsButton"
        settingsButton.textContent = "Show/Hide Bus Stops"
        settingsButton.classList.add(CSS_CLASS_SETTINGS);
        settingsButton.addEventListener('click', async () => await ToggleStops());
        countdownDiv.appendChild(document.createElement('hr'));
        countdownDiv.appendChild(settingsButton);

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
        map.controls[google.maps.ControlPosition.TOP_LEFT].push(countdownDiv);
    }
}

async function UpdateBusPositionMarkers(fetchNewData)
{
	let response = null;
	
	if (fetchNewData)
	{
		response = await fetch('bus-positions')
	}
	
    if (!fetchNewData || response.ok)
    {
		if (fetchNewData)
		{
			buses = await response.json();
		}
		
        for (let index in markers)
        {
            markers[index].setMap(null);
        }

        markers = [];
        let selectedBtns = document.getElementsByClassName(CSS_CLASS_SELECTED);

        for (let i in buses)
        {
            if (selectedBtns.namedItem(buses[i].route) || selectedBtns.length == 0)
            {
                markers.push(new google.maps.Marker(
                {
                    position:
                    {
                        lat: buses[i].position.latitude,
                        lng: buses[i].position.longitude
                    },
                    map: map,
                    label:
                    {
                        text: buses[i].route,
                        fontWeight: 'bold',
                        fontSize: buses[i].route.length > 2 ? '10px' : '17px'
                    },
                    icon:
                    {
                        url: 'bus.png',
                        labelOrigin: new google.maps.Point(15, 12)
                    }
                }));
            }
        }
    }
}

let secCount = UPDATE_INTERVAL_SEC;
setInterval(async function()
{
    secCount--;
    if (secCount == 0)
    {
        await UpdateBusPositionMarkers(true);
        secCount = UPDATE_INTERVAL_SEC;
    }
    
    document.getElementById('countdown').innerHTML = 'Next update in ' + secCount + ' seconds';
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
        let coords = [];
        if (response.ok)
        {
            coords = await response.json();
        }

        let routeObj = 
        {
            route: route,
            name: route.routeShortName,
            lines: []
        };
        
        coords.forEach(coordSet => routeObj.lines.push(new google.maps.Polyline(
        {
            path: coordSet,
            icons: GenerateArrowIcons(),
            map: map,
            strokeColor: '#' + route.routeColor
        })));

        if(showStops)
        {
            DisplayStops(route);
        }

        displayedRoutes.push(routeObj);
        btn.classList.add(CSS_CLASS_SELECTED);
    }
    else
    {
        let displayedRouteIndex = displayedRoutes.findIndex(displayedRoute => displayedRoute.name == route.routeShortName);
        displayedRoutes[displayedRouteIndex].lines.forEach(line => line.setMap(null));
        displayedRoutes.splice(displayedRouteIndex, 1);

        if(showStops)
        {
            let displayedStopIndex = displayedStops.findIndex(displayedStop => displayedStop.name == route.routeShortName);
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
    let settingsButton = document.getElementById('settingsButton');
    let selectedRoutes = document.getElementsByClassName(CSS_CLASS_SELECTED);

    if(showStops)
    {
        settingsButton.classList.add(CSS_CLASS_SETACTIVE);
    }
    else
    {
        settingsButton.classList.remove(CSS_CLASS_SETACTIVE);
    }

    for(let routeButton of selectedRoutes)
    {
        let routeShortName = routeButton.textContent.split(' - ')[0];
        displayedRoutes.forEach(displayedRoute =>
        {
            if(displayedRoute.route.routeShortName == routeShortName)
            {
                if(showStops)
                {
                    DisplayStops(displayedRoute.route);
                }
                else
                {
                    let displayedStopIndex = displayedStops.findIndex(displayedStop => displayedStop.name == displayedRoute.route.routeShortName);
                    displayedStops[displayedStopIndex].stops.forEach(stop => stop.setMap(null));
                    displayedStops.splice(displayedStopIndex, 1);
                }
            }
        });
    }
}

function DisplayStops(route)
{
    const markerImage = "marker.png";

    let stopObj = 
    {
        name: route.routeShortName,
        stops: []
    };

    route.routeStops.forEach(stop => 
    {
        const marker = new google.maps.Marker(
        {
            position: { lat: stop.stopLat, lng: stop.stopLon },
            map,
            icon: markerImage,
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