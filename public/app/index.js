let map;
let markers = [];

function initMap()
{    
    map = new google.maps.Map(document.getElementById('map'),
    {
        zoom: 13,
        center: { lat: 43.538832, lng: -80.245294 },
    });
    
    Update();
}

function Update()
{
    fetch('./app/data')
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
                    fontWeight: 'bold'
                },
                icon:
                {
                    url: './app/bus.png',
                    labelOrigin: new google.maps.Point(14, 12)
                }
            }));
        }
    });
}

setInterval(function()
{
    Update();
}, 31000);

let count = 31;
setInterval(function()
{
    count--;
    if (count == 0)
    {
        count = 31;
    }
    
    document.getElementById('countdown').innerHTML = 'Next update in ' + count + ' seconds';
}, 1000);
