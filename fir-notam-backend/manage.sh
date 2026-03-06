#!/bin/bash

PORT=3001
LOG_FILE="./backend.log"

start() {
    echo "Checking if port $PORT is currently in use..."
    PID=$(lsof -i :$PORT -t)
    
    if [ -n "$PID" ]; then
        echo "Port $PORT is currently occupied by PID $PID. Ensure it is stopped first."
    else
        echo "Starting backend service on port $PORT..."
        nohup npm run start > $LOG_FILE 2>&1 &
        echo "Backend started in background. Logs are outputting to $LOG_FILE."
    fi
}

start_dev() {
    echo "Checking if port $PORT is currently in use..."
    PID=$(lsof -i :$PORT -t)
    
    if [ -n "$PID" ]; then
        echo "Port $PORT is currently occupied by PID $PID. Ensure it is stopped first."
    else
        echo "Starting backend DEV service on port $PORT..."
        nohup npm run dev > $LOG_FILE 2>&1 &
        echo "Backend (DEV MODE) started in background. Logs are outputting to $LOG_FILE."
    fi
}

stop() {
    echo "Stopping backend service listening on port $PORT..."
    PID=$(lsof -i :$PORT -t)
    
    if [ -n "$PID" ]; then
        kill -9 $PID
        echo "Backend process (PID: $PID) terminated peacefully."
    else
        echo "No backend service found running on port $PORT."
    fi
}

status() {
    PID=$(lsof -i :$PORT -t)
    if [ -n "$PID" ]; then
        echo "Backend is RUNNING on port $PORT (PID: $PID)."
    else
        echo "Backend is STOPPED."
    fi
}

case "$1" in
    start)
        start
        ;;
    dev)
        start_dev
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    restart)
        stop
        sleep 2
        start
        ;;
    *)
        echo "Usage: $0 {start|dev|stop|status|restart}"
        exit 1
        ;;
esac
