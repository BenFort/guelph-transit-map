const express = require('express');
const protobuf = require("protobufjs");
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');

let routes = [];
let trips = [];
let shapes = [];
let stops = [];
let stopTimes = [];

let root = protobuf.loadSync('gtfs-realtime.proto');
let FeedMessage = root.lookupType("transit_realtime.FeedMessage");

let DateFormatter = new Intl.DateTimeFormat(
    undefined,
    {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Toronto'
    });

const app = express();

app.use(express.static('public'));

async function UpdateArrays()
{
    let response = await fetch('http://data.open.guelph.ca/datafiles/guelph-transit/guelph_transit_gtfs.zip');
    if (response.ok)
    {
        let responseData = await response.arrayBuffer();
        let unzippedFileBuffer = await unzipper.Open.buffer(Buffer.from(responseData));
        
        let routesFileBuffer = await unzippedFileBuffer.files.find(x => x.path == 'routes.txt').buffer();
        routes = parse(routesFileBuffer.toString(), { columns: true });

        let tripsFileBuffer = await unzippedFileBuffer.files.find(x => x.path == 'trips.txt').buffer();
        trips = parse(tripsFileBuffer.toString(), { columns: true });
                
        let shapesFileBuffer = await unzippedFileBuffer.files.find(x => x.path == 'shapes.txt').buffer();
        shapes = parse(shapesFileBuffer.toString(), { columns: true });

        let stopsFileBuffer = await unzippedFileBuffer.files.find(x => x.path == 'stops.txt').buffer();
        stops = parse(stopsFileBuffer.toString(), { columns: true });

        let timesFileBuffer = await unzippedFileBuffer.files.find(x => x.path == 'stop_times.txt').buffer();
        stopTimes = parse(timesFileBuffer.toString(), { columns: true });
    }
}

function ConvertUnixTimestampToString(timestampSeconds)
{
    let dateObj = new Date(timestampSeconds * 1000); // Dates use milliseconds in constructor

    return DateFormatter.format(dateObj);
}

async function GetRouteName(routeId)
{
    let route = routes.find(x => x.route_id == routeId);

    if (!route)
    {
        await UpdateArrays();
    }

    route = routes.find(x => x.route_id == routeId);

    return route?.route_short_name ?? 'UKNOWN';
}

app.get('/bus-positions', async function (req, res)
{
    let response = await fetch('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb');
    if (response.ok)
    {
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await response.arrayBuffer())));
        
        let vehicles = [];
                
        for (let entityIndex in object.entity)
        {
            vehicles.push({ 'routeShortName': await GetRouteName(object.entity[entityIndex].vehicle.trip.routeId), 'position': object.entity[entityIndex].vehicle.position });
        }

        res.json(vehicles);
    }
});

app.get('/alerts', async function (req, res)
{
    let response = await fetch('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/alert/alerts.pb');
    if (response.ok)
    {
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await response.arrayBuffer())), 
        {
            enums: String,
            longs: Number
        });

        let alerts = [];

        for (let entityIndex in object.entity)
        {
            let activePeriod =
            {
                start: ConvertUnixTimestampToString(object.entity[entityIndex].alert.activePeriod[0].start),
                end: ConvertUnixTimestampToString(object.entity[entityIndex].alert.activePeriod[0].end)
            };

            let alert =
            {
                activePeriod: activePeriod,
                affectedRoutes: object.entity[entityIndex].alert.informedEntity,
                alertType: object.entity[entityIndex].alert.effect,
                descriptionText: object.entity[entityIndex].alert.ttsDescriptionText.translation[0].text
            }
            alerts.push(alert);
        }
        res.json(alerts);
    }
});

app.get('/shape-coords-for-route-id', function (req, res)
{
    let result = [];
    let shapeIds = new Set();

    trips.filter(trip => trip.route_id == req.query.routeId).forEach(trip => shapeIds.add(trip.shape_id));
    
    shapeIds.forEach(shapeId =>
    {
        let shapeCoords = [];
        shapes.filter(shape => shape.shape_id == shapeId).forEach(shape => shapeCoords.push({ lat: Number(shape.shape_pt_lat), lng: Number(shape.shape_pt_lon) }));
        result.push(shapeCoords);
    });
    
    res.json(result);
});

app.get('/route-data', function (req, res)
{
    let result = [];
    let tripIdStopIds = {};
    
    stopTimes.forEach(stopTime =>
    {
        let key = stopTime.trip_id.toString();
        if (!tripIdStopIds[key])
        {
            tripIdStopIds[key] = { stopIds: new Set([stopTime.stop_id]) };
        }
        else
        {
            tripIdStopIds[key].stopIds.add(stopTime.stop_id);
        }
    });

    routes.forEach(route =>
    {
        let routeStopIds = new Set();
        trips
            .filter(trip => trip.route_id == route.route_id)
            .forEach(trip => tripIdStopIds[trip.trip_id.toString()].stopIds.forEach(stopId => routeStopIds.add(stopId)));
        
        let routeStops = [];
        routeStopIds.forEach(stopId =>
        {
            let stop = stops.find(stop => stop.stop_id == stopId);
            routeStops.push({ stopName: stop.stop_name, stopLat: Number(stop.stop_lat), stopLon: Number(stop.stop_lon), stopId: stop.stop_id });
        });

        result.push({ routeId: route.route_id, routeShortName: route.route_short_name, routeLongName: route.route_long_name, routeColor: route.route_color, routeStops: routeStops });
    });
    
    res.json(result);
});

app.listen(8081, async function()
{
    await UpdateArrays();
});

setInterval(async function()
{
    await UpdateArrays();
}, 1000 * 60 * 60 * 24);
