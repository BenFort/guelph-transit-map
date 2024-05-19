const express = require('express');
const protobuf = require("protobufjs");
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');

let routes = [];
let trips = [];
let shapes = [];
let stops = [];
let times = [];

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
        times = parse(timesFileBuffer.toString(), { columns: true });
    }
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
        
        let root = protobuf.loadSync('gtfs-realtime.proto');
            
        let FeedMessage = root.lookupType("transit_realtime.FeedMessage");
        
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(responseData)));
        
        let vehicles = [];
        
        for (let entityIndex in object.entity)
        {
            vehicles.push({ 'route': await GetRouteName(object.entity[entityIndex].vehicle.trip.routeId), 'position': object.entity[entityIndex].vehicle.position });
        }

        res.json(vehicles);
    }
});

app.get('/shape-coords-for-route-id', function (req, res)
{
    let result = [];

    let tripsForRoute = trips.filter(trip => trip.route_id == req.query.routeId);
    
    let shapeIds = new Set();
    tripsForRoute.forEach(trip => shapeIds.add(trip.shape_id));
    
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
    routes.forEach(route =>
    {
        let routeTrips = [];
        let routeStops = [];
        let routeStopIDs = [];
        trips.forEach(trip =>
        {
            if (trip.route_id == route.route_id){
                if(!routeTrips.includes(trip.trip_id))
                {
                    routeTrips.push(trip.trip_id)
                }   
            }
        });
        times.forEach(time =>
        {
            routeTrips.forEach(routeTrip =>
            {
                if (time.trip_id == routeTrip){
                    if(!routeStopIDs.includes(time.stop_id))
                    {
                        routeStopIDs.push(time.stop_id)
                    } 
                }     
            });
        });
        stops.forEach(stop =>
        {
            routeStopIDs.forEach(routeStopID =>
            {
                if (stop.stop_id == routeStopID){
                    routeStops.push({ stopId: Number(stop.stop_id), stopName: stop.stop_name, stopDesc: stop.stop_desc, stopLat: Number(stop.stop_lat), stopLon: Number(stop.stop_lon) })
                }     
            });
        });
        result.push({ routeId: Number(route.route_id), routeShortName: route.route_short_name, routeLongName: route.route_long_name, routeColor: route.route_color, routeStops: routeStops });
    });
    res.json(result);
});

app.get('/stop-data', function (req, res)
{
    let result = [];
    stops.forEach(stop => result.push({ stopId: Number(stop.stop_id), stopName: stop.stop_name, stopDesc: stop.stop_desc, stopLat: Number(stop.stop_lat), stopLon: Number(stop.stop_lon) }));
    res.json(result);
});

app.listen(8081, async function()
{
    await UpdateArrays();
});
