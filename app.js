require('dotenv').config();

const express = require('express');
const protobuf = require("protobufjs");
const https = require('https');
const fs = require('fs');
const { parse } = require('csv-parse');

let ROUTES;

const parser = parse({columns: true}, function(err, data)
{
    ROUTES = data;
});

fs.createReadStream(__dirname + '/routes.txt').pipe(parser);

const app = express();

app.use(express.static('public'));
app.use(express.static('public/app'));

const ENDPOINT_PREFIX = process.env.NGINX_CONFIG === 'true' ? '' : '/app';

function GetPath(path)
{
    return ENDPOINT_PREFIX + path;
}

function GetRouteName(routeId)
{
    for (let routeIndex in ROUTES)
    {
        let route = ROUTES[routeIndex];
        if (route.route_id === routeId)
        {
            return route.route_short_name;
        }
    }
    return 'UNKNOWN';
}

app.get(GetPath('/map-script'), function(req, res)
{
    https.get('https://maps.googleapis.com/maps/api/js?key=' + process.env.GOOGLE_MAPS_API_KEY + '&callback=initMap', function(resp)
    {
        let data = '';

        resp.on('data', function(chunk)
        {
            data += chunk;
        });

        resp.on('end', function()
        {
            res.type('.js');
            res.send(data);
        });

    }).on('error', function(err)
    {
        console.log('Error: ' + err.message);
    });

});

app.get(GetPath('/data'), function (req, res)
{
    https.get('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb', function(resp)
    {
        let data = [];

        resp.on('data', function(chunk)
        {
            data.push(chunk);
        });

        resp.on('end', function()
        {
            let buffer = Buffer.concat(data);
            
            protobuf.load('gtfs-realtime.proto', function(err, root)
            {
                if (err)
                    throw err;
                
                let FeedMessage = root.lookupType("transit_realtime.FeedMessage");
                        
                let message = FeedMessage.decode(buffer);
                
                let object = FeedMessage.toObject(message, {
                    enums: String
                });
                
                let vehicles = [];
                
                for (let entityIndex in object.entity)
                {
                    vehicles.push({ 'route': GetRouteName(object.entity[entityIndex].vehicle.trip.routeId), 'position': object.entity[entityIndex].vehicle.position });
                }
                
                res.json(vehicles);
            });
        });

    }).on('error', function(err)
    {
        console.log('Error: ' + err.message);
    });
});

app.listen(8081);

