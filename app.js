const express = require('express');
const protobuf = require("protobufjs");
const { parse } = require('csv-parse/sync');
const unzipper = require('unzipper');

let routes = [];
let trips = [];
let shapes = [];
let stops = [];
let stopTimes = [];

const TRIP_UPDATES_MAX_AGE_MS = 30 * 1000;
const TRIP_UPDATES_TIMEOUT_MS = 10 * 1000;
const MAX_STOP_ARRIVALS = 5;
const MAX_NEXT_STOPS = 5;

let tripUpdates = [];
let tripUpdatesFetchedAt = 0;
let tripUpdatesRequest = null;

let root = protobuf.loadSync('gtfs-realtime.proto');
let FeedMessage = root.lookupType("transit_realtime.FeedMessage");

let DateFormatter = new Intl.DateTimeFormat(
    undefined,
    {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Toronto'
    });

let TorontoTimeFormatter = new Intl.DateTimeFormat(
    'en-US',
    {
        timeZone: 'America/Toronto',
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });

const app = express();

app.use(express.static('public'));

console.log(new Date().toLocaleString(), " Guelph Transit Map starting!");

async function UpdateArrays()
{
    let response = await fetch('https://drive.google.com/uc?export=download&id=1SsCgQ0agO_EONavJoOuBPMlbcu2VcUs4');
    if (response.ok)
    {
        let responseData = await response.arrayBuffer();
        let unzippedFileBuffer = await unzipper.Open.buffer(Buffer.from(responseData));
        
        let routesFileBuffer = await unzippedFileBuffer.files.find(x => x.path === 'routes.txt').buffer();
        routes = parse(routesFileBuffer.toString(), { columns: true });

        let tripsFileBuffer = await unzippedFileBuffer.files.find(x => x.path === 'trips.txt').buffer();
        trips = parse(tripsFileBuffer.toString(), { columns: true });
                
        let shapesFileBuffer = await unzippedFileBuffer.files.find(x => x.path === 'shapes.txt').buffer();
        shapes = parse(shapesFileBuffer.toString(), { columns: true });

        let stopsFileBuffer = await unzippedFileBuffer.files.find(x => x.path === 'stops.txt').buffer();
        stops = parse(stopsFileBuffer.toString(), { columns: true });

        let timesFileBuffer = await unzippedFileBuffer.files.find(x => x.path === 'stop_times.txt').buffer();
        stopTimes = parse(timesFileBuffer.toString(), { columns: true });
    }
}

function ConvertUnixTimestampToString(timestampSeconds)
{
    let dateObj = new Date(timestampSeconds * 1000); // Dates use milliseconds in constructor

    return DateFormatter.format(dateObj);
}

async function GetRouteData(routeId)
{
    let route = routes.find(x => x.route_id === routeId);

    if (!route)
    {
        await UpdateArrays();
    }

    route = routes.find(x => x.route_id === routeId);

    return { routeName: route?.route_short_name ?? '?', routeColour: route?.route_color ?? '000000' };
}

// The predictions feed is large, so it is fetched at most once per TRIP_UPDATES_MAX_AGE_MS and shared between requests
async function GetTripUpdates()
{
    if (Date.now() - tripUpdatesFetchedAt > TRIP_UPDATES_MAX_AGE_MS)
    {
        tripUpdatesRequest ??= FetchTripUpdates().finally(() => tripUpdatesRequest = null);
        await tripUpdatesRequest;
    }

    return tripUpdates;
}

async function FetchTripUpdates()
{
    let tripUpdatesResponse = await fetch('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/tripupdate/tripupdates.pb', { signal: AbortSignal.timeout(TRIP_UPDATES_TIMEOUT_MS) });
    if (!tripUpdatesResponse.ok)
    {
        throw new Error('Trip updates request failed with status ' + tripUpdatesResponse.status);
    }

    let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await tripUpdatesResponse.arrayBuffer())),
    {
        enums: String,
        longs: Number
    });

    tripUpdates = (object.entity ?? [])
        .map(entity => entity.tripUpdate)
        .filter(tripUpdate => tripUpdate?.trip.tripId && tripUpdate.trip.scheduleRelationship !== 'CANCELED');
    tripUpdatesFetchedAt = Date.now();
}

function GetUpcomingStops(tripUpdate)
{
    let earliestTime = Date.now() / 1000 - 60;

    return (tripUpdate.stopTimeUpdate ?? [])
        .filter(stopTimeUpdate => stopTimeUpdate.scheduleRelationship !== 'SKIPPED')
        .map(stopTimeUpdate => (
        {
            stopId: stopTimeUpdate.stopId,
            stopSequence: stopTimeUpdate.stopSequence,
            arrivalTime: stopTimeUpdate.arrival?.time ?? stopTimeUpdate.departure?.time
        }))
        .filter(upcomingStop => upcomingStop.arrivalTime >= earliestTime);
}

// GTFS schedule times are counted from noon minus 12 hours, local time, on the trip's service date
function GetServiceDayStart(startDate)
{
    let noonUtcMs = Date.UTC(Number(startDate.slice(0, 4)), Number(startDate.slice(4, 6)) - 1, Number(startDate.slice(6, 8)), 12);
    let parts = {};
    TorontoTimeFormatter.formatToParts(new Date(noonUtcMs)).forEach(part => parts[part.type] = Number(part.value));
    let torontoOffsetMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - noonUtcMs;

    return (noonUtcMs - torontoOffsetMs) / 1000 - 12 * 60 * 60;
}

function GetDelaySeconds(tripUpdate, upcomingStop)
{
    let scheduledStop = stopTimes.find(stopTime => stopTime.trip_id === tripUpdate.trip.tripId && Number(stopTime.stop_sequence) === upcomingStop.stopSequence);

    if (!scheduledStop?.arrival_time || !tripUpdate.trip.startDate)
    {
        return null;
    }

    let [hours, minutes, seconds] = scheduledStop.arrival_time.split(':').map(Number);

    return upcomingStop.arrivalTime - (GetServiceDayStart(tripUpdate.trip.startDate) + hours * 3600 + minutes * 60 + seconds);
}

app.get('/bus-positions', async function (req, res)
{
    let vehiclePositionsResponse = await fetch('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb');
    if (vehiclePositionsResponse.ok)
    {
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await vehiclePositionsResponse.arrayBuffer())));
        
        let vehicles = [];
                
        for (let entityIndex in object.entity)
        {            
            let vehicle = object.entity[entityIndex].vehicle;
            
            const routeData = await GetRouteData(vehicle.trip.routeId);
            const tripHeadsign = trips.find(x => x.trip_id === vehicle.trip.tripId)?.trip_headsign ?? '';


            vehicles.push(
            {
                routeShortName: routeData.routeName,
                routeColour: routeData.routeColour,
                position: vehicle.position,
                tripHeadsign: tripHeadsign,
                tripId: vehicle.trip.tripId
            });
        }

        res.json(vehicles);
    }
});

app.get('/alerts', async function (req, res)
{
    let alertsResponse = await fetch('https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/alert/alerts.pb');
    if (alertsResponse.ok)
    {
        let object = FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await alertsResponse.arrayBuffer())), 
        {
            enums: String,
            longs: Number
        });

        let alerts = [];
        try
        {
            for (let entityIndex in object.entity)
            {
                let routeAndStopInfo = [];

                if(object.entity[entityIndex].alert.informedEntity === undefined)
                {
                    continue;
                }

                object.entity[entityIndex].alert.informedEntity.forEach(idPair =>
                {

                    const route = routes.find(route => route.route_id === idPair.routeId);
                      
                    const routeShortName = route?.route_short_name ?? 'Unknown';

                    routeAndStopInfo.push(
                    {
                        routeShortName: routeShortName,
                        stopName: stops.find(stop => stop.stop_id === idPair.stopId)?.stop_name ?? 'Unknown'
                    });
                });
                
                let descriptionText = object.entity[entityIndex].alert.ttsDescriptionText.translation[0].text
    
                if(descriptionText === '.')
                {
                    descriptionText = object.entity[entityIndex].alert.descriptionText.translation[0].text.replace(/[\n\r]/g, ' ');
                }
    
                alerts.push(
                {
                    activePeriod:
                    {
                        start: ConvertUnixTimestampToString(object.entity[entityIndex].alert.activePeriod[0].start),
                        end: ConvertUnixTimestampToString(object.entity[entityIndex].alert.activePeriod[0].end)
                    },
                    routeAndStopInfo: routeAndStopInfo,
                    alertType: object.entity[entityIndex].alert.effect.replace('_', ' '),
                    descriptionText: descriptionText
                });
            }
        }
        catch (error)
        {
            console.error("An error occurred when parsing the alerts:\n", error.stack);
        }

        res.json(alerts);
    }
});

app.get('/stop-arrivals', async function (req, res)
{
    try
    {
        let arrivals = [];

        for (let tripUpdate of await GetTripUpdates())
        {
            let upcomingStop = GetUpcomingStops(tripUpdate).find(upcomingStop => upcomingStop.stopId === req.query.stopId);

            if (!upcomingStop)
            {
                continue;
            }

            let route = routes.find(route => route.route_id === tripUpdate.trip.routeId);

            arrivals.push(
            {
                routeShortName: route?.route_short_name ?? '?',
                routeColour: route?.route_color ?? '000000',
                tripHeadsign: trips.find(trip => trip.trip_id === tripUpdate.trip.tripId)?.trip_headsign ?? '',
                arrivalTime: upcomingStop.arrivalTime
            });
        }

        arrivals.sort((arrivalA, arrivalB) => arrivalA.arrivalTime - arrivalB.arrivalTime);
        res.json(arrivals.slice(0, MAX_STOP_ARRIVALS));
    }
    catch (error)
    {
        console.error('An error occurred when getting stop arrivals:\n', error.stack);
        res.status(502).json([]);
    }
});

app.get('/bus-trip', async function (req, res)
{
    try
    {
        let tripUpdate = (await GetTripUpdates()).find(tripUpdate => tripUpdate.trip.tripId === req.query.tripId);
        let upcomingStops = tripUpdate ? GetUpcomingStops(tripUpdate) : [];

        res.json(
        {
            delaySeconds: upcomingStops.length > 0 ? GetDelaySeconds(tripUpdate, upcomingStops[0]) : null,
            nextStops: upcomingStops.slice(0, MAX_NEXT_STOPS).map(upcomingStop => (
            {
                stopName: stops.find(stop => stop.stop_id === upcomingStop.stopId)?.stop_name ?? 'Unknown',
                arrivalTime: upcomingStop.arrivalTime
            }))
        });
    }
    catch (error)
    {
        console.error('An error occurred when getting the bus trip:\n', error.stack);
        res.status(502).json({ delaySeconds: null, nextStops: [] });
    }
});

app.get('/shape-coords-for-route-id', function (req, res)
{
    let result = [];
    let shapeIds = new Set();

    if (req.query.routeButtonText === "99 - North")
    {
        trips.filter(trip => trip.route_id === req.query.routeId && trip.trip_headsign === "99 Mainline Northbound").forEach(trip => shapeIds.add(trip.shape_id));
    }
    else if (req.query.routeButtonText === "99 - South")
    {
        trips.filter(trip => trip.route_id === req.query.routeId && trip.trip_headsign === "99 Mainline Southbound").forEach(trip => shapeIds.add(trip.shape_id));
    }
    else
    {
        trips.filter(trip => trip.route_id === req.query.routeId).forEach(trip => shapeIds.add(trip.shape_id));
    }
    
    shapeIds.forEach(shapeId =>
    {
        let shapeCoords = [];
        shapes.filter(shape => shape.shape_id === shapeId).forEach(shape => shapeCoords.push({ lat: Number(shape.shape_pt_lat), lng: Number(shape.shape_pt_lon) }));
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
        let key = stopTime.trip_id;
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
            .filter(trip => trip.route_id === route.route_id)
            .filter(trip => tripIdStopIds[trip.trip_id]?.stopIds)
            .forEach(trip =>
                tripIdStopIds[trip.trip_id].stopIds.forEach(stopId => routeStopIds.add(stopId))
            );
        
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

app.get('/stop-ids-for-trip-headsign', function (req, res)
{
    let result = [];
    let tripHeadsign = req.query.tripHeadsign;

    let tripIdStopIds = {};
    
    stopTimes.forEach(stopTime =>
    {
        let key = stopTime.trip_id;
        if (!tripIdStopIds[key])
        {
            tripIdStopIds[key] = { stopIds: new Set([stopTime.stop_id]) };
        }
        else
        {
            tripIdStopIds[key].stopIds.add(stopTime.stop_id);
        }
    });

    trips
        .filter(trip => trip.trip_headsign === tripHeadsign)
        .filter(trip => tripIdStopIds[trip.trip_id]?.stopIds)
        .forEach(trip =>
            tripIdStopIds[trip.trip_id].stopIds.forEach(stopId => result.push(stopId))
        );

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
