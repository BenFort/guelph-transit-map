require('dotenv').config();

const express = require('express');
const protobuf = require("protobufjs");
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');

let routes = [];

const app = express();

app.use(express.static('public'));

async function GetRouteName(routeId)
{
    let route = routes.find(x => x.route_id == routeId);

    if (!route)
    {
        let response = await fetch(new Request('http://data.open.guelph.ca/datafiles/guelph-transit/guelph_transit_gtfs.zip'));
        if (response.ok)
        {
            let responseData = await response.arrayBuffer();
            let unzippedFileBuffer = await unzipper.Open.buffer(Buffer.from(responseData));
            let routesFileBuffer = await unzippedFileBuffer.files.find(x => x.path == 'routes.txt').buffer();
            routes = parse(routesFileBuffer.toString(), { columns: true });
        }
    }

    route = routes.find(x => x.route_id == routeId);

    return route?.route_short_name ?? 'UKNOWN';
}

app.get('/data', async function (req, res)
{
    let response = await fetch(new Request('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb'));
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

app.listen(8081);
