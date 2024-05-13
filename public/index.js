let map;
let markers = [];
let displayedRoutes = [];

async function initMap()
{
    map = new google.maps.Map(document.getElementById('map'),
    {
        zoom: 13,
        center: { lat: 43.538832, lng: -80.245294 },
    });

    UpdateBusPositionMarkers();

    response = await fetch('route-data');
    if (response.ok)
    {
        let routes = await response.json();
        routes.sort(CompareRoutes);
        routes.forEach(route =>
        {
            const newButton = document.createElement('button');
            newButton.textContent = route.routeShortName + ' - ' + route.routeLongName;
            newButton.style.fontSize = '50px';
            newButton.style.margin = '8px';
            newButton.style.height = 90;
            newButton.style.backgroundColor = '#' + route.routeColor
            newButton.style.color = 'white';
            newButton.addEventListener('click', async () => await DisplayRoute(route.routeId, '#' + route.routeColor));
            document.body.appendChild(newButton);
        });
    }
}

function UpdateBusPositionMarkers()
{
    fetch('bus-positions')
    .then(response => { return response.json() })
    .then(buses =>
    {
        for (let index in markers)
        {
            markers[index].setMap(null);
        }

        markers = [];

        for (let i in buses)
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
    });
}

let count = 31;
setInterval(function()
{
    count--;
    if (count == 0)
    {
        UpdateBusPositionMarkers();
        count = 31;
    }
    
    document.getElementById('countdown').innerHTML = 'Next update in ' + count + ' seconds';
}, 1000);

function GenerateArrowIcons()
{
    const lineSymbol =
    {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    };

    let icons = [];
    let interval = 100 / 10;
    for (let i = interval; i < 100; i += interval)
    {
        icons.push({ icon: lineSymbol, offset: i + '%' });
    }
    return icons;
}

async function DisplayRoute(routeId, color)
{
    displayedRoutes.forEach(route => route.setMap(null));

    let response = await fetch('shape-coords-for-route-id?' + new URLSearchParams({ routeId: routeId }));
    let coords = [];
    if (response.ok)
    {
        coords = await response.json();
    }

    // Create the polyline and add the symbol via the 'icons' property.
    coords.forEach(coordSet => displayedRoutes.push(new google.maps.Polyline(
    {
        path: coordSet,
        icons: GenerateArrowIcons(),
        map: map,
        strokeColor: color
    })));
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