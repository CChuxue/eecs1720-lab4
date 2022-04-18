# -*- coding: utf-8 -*-

"""
Chat Server
===========

This simple application uses WebSockets to run a primitive chat server.
"""

import os
import logging
import redis
import gevent
import json
from flask import Flask, render_template, request
from flask_sockets import Sockets
import pickle

REDIS_URL = os.environ['REDIS_URL']
REDIS_CHAN = 'chat'

app = Flask(__name__)
app.debug = 'DEBUG' in os.environ

sockets = Sockets(app)
redis = redis.from_url(REDIS_URL)

# init map
mapData = [0] * (30 * 19)
if redis.exists('map'):
    mapData = pickle.loads(redis.get('map'))

class ChatBackend(object):
    """Interface for registering and updating WebSocket clients."""

    def __init__(self):
        self.clients = list()
        self.pubsub = redis.pubsub()
        self.pubsub.subscribe(REDIS_CHAN)

    def __iter_data(self):
        for message in self.pubsub.listen():
            data = message.get('data')
            app.logger.info(u'Test Message: {}'.format(data))
            if message['type'] == 'message':
                # app.logger.info(u'Sending message: {}'.format(data))
                yield data

    def register(self, client):
        """Register a WebSocket connection for Redis updates."""
        self.clients.append(client)

    def send(self, client, data):
        """Send given data to the registered client.
        Automatically discards invalid connections."""
        try:
            client.send(data)
        except Exception:
            self.clients.remove(client)

    def run(self):
        """Listens for new messages in Redis, and sends them to clients."""
        for data in self.__iter_data():
            for client in self.clients:
                gevent.spawn(self.send, client, data)

    def start(self):
        """Maintains Redis subscription in the background."""
        gevent.spawn(self.run)

chats = ChatBackend()
chats.start()


@app.route('/')
def hello():
    playerCount = redis.incr('playerCount')
    playCount = redis.get('playCount')
    if playCount is None:
        playCount = 0
    else:
        playCount = int(playCount.decode())
    winCount = redis.get('winCount')
    if winCount is None:
        winCount = 0
    else:
        winCount = int(winCount.decode())
    modifyCount = redis.get('modifyCount')
    if modifyCount is None:
        modifyCount = 0
    else:
        modifyCount = int(modifyCount.decode())
    return render_template('index.html', playerCount = playerCount, playCount = playCount, winCount = winCount, modifyCount = modifyCount)

@app.route('/play', methods=['GET'])
def play():
    args = request.args
    playerCount = redis.incr('playCount')

    if args.get("win") is not None:
        playerCount = redis.incr('winCount')
        pickled_object = pickle.dumps(mapData)
        redis.set('map', pickled_object)
    else:
        pos = ','.join([args.get('x'),args.get('y')])
        redis.lpush('test', pos)

    if args.get("player") is not None:
        playerCount = redis.incr(args.get("player") + 'count')
    
    response = app.response_class(
        response=json.dumps({"state": "ok"}),
        status=200,
        mimetype='application/json'
    )
    return response

@app.route('/death', methods=['GET'])
def death():
    response = app.response_class(
        response=json.dumps([x.decode() for x in redis.lrange('test', 0, -1)]),
        status=200,
        mimetype='application/json'
    )
    return response

@app.route('/change', methods=['GET'])
def change():
    args = request.args
    playerCount = redis.incr('modifyCount')

    x = int(args.get('x'))
    y = int(args.get('y'))
    t = int(args.get('t'))

    i = y * 30 + x
    if len(mapData) <= i:
        response = app.response_class(
            response=json.dumps({"state": "failed"}),
            status=200,
            mimetype='application/json'
        )
        return response

    mapData[i] = t
    pickled_object = pickle.dumps(mapData)
    redis.set('map', pickled_object)
    response = app.response_class(
        response=json.dumps({"state": "ok"}),
        status=200,
        mimetype='application/json'
    )
    return response

@app.route('/map', methods=['GET'])
def get_map():
    response = app.response_class(
        response=json.dumps(mapData),
        status=200,
        mimetype='application/json'
    )
    return response

@sockets.route('/submit')
def inbox(ws):
    """Receives incoming chat messages, inserts them into Redis."""
    while not ws.closed:
        # Sleep to prevent *constant* context-switches.
        gevent.sleep(0.1)
        message = ws.receive()

        if message:
            app.logger.info(u'Inserting message: {}'.format(message))
            redis.publish(REDIS_CHAN, message)

@sockets.route('/receive')
def outbox(ws):
    """Sends outgoing chat messages, via `ChatBackend`."""
    chats.register(ws)

    while not ws.closed:
        # Context switch while `ChatBackend.start` is running in the background.
        gevent.sleep(0.1)



