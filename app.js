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

function UnixTimestampConverter(timestamp)
{
    let dateObj = new Date(timestamp * 1000);
    let months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let year = dateObj.getFullYear();
    let month = months[dateObj.getMonth()];
    let date = dateObj.getDate();

    let hour = dateObj.getHours();
    hour = hour <=9 ? `0${hour}` : hour;

    let min = dateObj.getMinutes();
    min = min <=9 ? `0${min}` : min;

    let sec = dateObj.getSeconds();
    sec = sec <=9 ? `0${sec}` : sec;

    let converted = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + '.' + sec ;

    return converted;
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
        let responseData = await response.arrayBuffer();
        
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(responseData)));
        
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
        let responseData = await response.arrayBuffer();
        
        let message = FeedMessage.decode(new Uint8Array(responseData));

        let object = FeedMessage.toObject(message, 
        {
            enums: String
        });
        
        let alerts = [];

        for (let entityIndex in object.entity)
        {
            let activePeriod =
            {
                start: UnixTimestampConverter(object.entity[entityIndex].alert.activePeriod[0].start.low),
                end: UnixTimestampConverter(object.entity[entityIndex].alert.activePeriod[0].end.low)
            };

            let alert = {
                alertID: object.entity[entityIndex].id,
                activePeriod: activePeriod,
                affectedRoutes: object.entity[entityIndex].alert.informedEntity,
                alertType: object.entity[entityIndex].alert.effect,
                headerText: object.entity[entityIndex].alert.headerText.translation[0].text,
                descriptionText: object.entity[entityIndex].alert.ttsDescriptionText.translation[0].text,
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
            routeStops.push({ stopName: stop.stop_name, stopLat: Number(stop.stop_lat), stopLon: Number(stop.stop_lon), stopId: stop.stop_id});
        });

        result.push({ routeId: route.route_id, routeShortName: route.route_short_name, routeLongName: route.route_long_name, routeColor: route.route_color, routeStops: routeStops });
    });
    
    res.json(result);
});

app.listen(8081, async function()
{
    await UpdateArrays();
});
