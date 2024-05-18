const CSS_CLASS_SELECTED = 'selected';
const UPDATE_INTERVAL_SEC = 31;

let map;
let markers = [];
let displayedRoutes = [];
let buses = [];

async function initMap()
{
    map = new google.maps.Map(document.getElementById('map'),
    {
        zoom: 13,
        center: { lat: 43.538832, lng: -80.245294 },
        gestureHandling: 'greedy'
    });

    await UpdateBusPositionMarkers(true);

    response = await fetch('route-data');
    if (response.ok)
    {
        let routes = await response.json();
        routes.sort(CompareRoutes);
        routes.forEach(route =>
        {
            const newButton = document.createElement('button');
            newButton.textContent = route.routeShortName + ' - ' + route.routeLongName;
            newButton.style.fontSize = '25px';
            newButton.style.margin = '6px';
            newButton.style.height = 70;
            newButton.style.width = 350;
            newButton.style.backgroundColor = '#' + route.routeColor
            newButton.style.color = 'white';
            newButton.id = route.routeShortName;
            newButton.addEventListener('click', async () => await ToggleRoute(route));
            document.body.appendChild(newButton);
        });
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
        
        displayedRoutes.push(routeObj);
        
        btn.classList.add(CSS_CLASS_SELECTED);
    }
    else
    {
        let displayedRouteIndex = displayedRoutes.findIndex(displayedRoute => displayedRoute.name == route.routeShortName);
        displayedRoutes[displayedRouteIndex].lines.forEach(line => line.setMap(null));
        displayedRoutes.splice(displayedRouteIndex, 1);
        btn.classList.remove(CSS_CLASS_SELECTED);
    }
	
	await UpdateBusPositionMarkers(false);
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