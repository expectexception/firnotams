#!/bin/bash

# ========================================
# Configuration Section - Edit These
# ========================================
# Option 1: Set URLs directly (recommended for quick setup)
FRONTEND_URL=${FRONTEND_URL:-"http://localhost:5173"}
BACKEND_URL=${BACKEND_URL:-"http://localhost:3001"}

# Option 2: Or set hostname and port separately
# FRONTEND_HOSTNAME=${FRONTEND_HOSTNAME:-localhost}
# FRONTEND_PORT=${FRONTEND_PORT:-3000}
# BACKEND_HOSTNAME=${BACKEND_HOSTNAME:-localhost}
# BACKEND_PORT=${BACKEND_PORT:-8000}

PID_FILE=".tunnel_pids"
LOG_DIR="./tunnel_logs"

# ========================================
# Create log directory
# ========================================
mkdir -p "$LOG_DIR"

# ========================================
# Functions
# ========================================

show_help() {
    cat << EOF
Usage: ./start_tunnels.sh [COMMAND] [OPTIONS]

Commands:
    start           Start the tunnels (default)
    stop            Stop the tunnels
    restart         Restart the tunnels
    status          Show tunnel status
    logs            Show tunnel logs

Options:
    --frontend-url URL     Set frontend URL (e.g., http://localhost:3001)
    --backend-url URL      Set backend URL (e.g., http://localhost:8001)
    -h, --help            Show this help message

Quick Setup:
    1. Edit FRONTEND_URL and BACKEND_URL in the script directly, then run:
       ./start_tunnels.sh start

    2. Or override via environment variables:
       FRONTEND_URL="http://192.168.1.100:3000" BACKEND_URL="http://192.168.1.101:8000" ./start_tunnels.sh start

    3. Or use command-line options:
       ./start_tunnels.sh start --frontend-url http://localhost:3001 --backend-url http://localhost:8001

Examples:
    ./start_tunnels.sh start
    ./start_tunnels.sh start --frontend-url http://192.168.1.100:3000
    FRONTEND_URL="http://api.example.com:3000" ./start_tunnels.sh start
    ./start_tunnels.sh stop
    ./start_tunnels.sh status
EOF
}

log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

save_pids() {
    echo "$1" > "$PID_FILE"
    echo "$2" >> "$PID_FILE"
    log_info "PIDs saved to $PID_FILE"
}

load_pids() {
    if [ -f "$PID_FILE" ]; then
        mapfile -t pids < "$PID_FILE"
        FRONTEND_PID="${pids[0]}"
        BACKEND_PID="${pids[1]}"
        return 0
    fi
    return 1
}

start_tunnels() {
    echo "========================================="
    echo "  Cloudflared Tunnel Starter Script      "
    echo "========================================="
    log_info "Starting tunnels..."
    log_info "Frontend: $FRONTEND_URL"
    log_info "Backend:  $BACKEND_URL"

    # Check if tunnels are already running
    if [ -f "$PID_FILE" ]; then
        if load_pids; then
            if kill -0 "$FRONTEND_PID" 2>/dev/null && kill -0 "$BACKEND_PID" 2>/dev/null; then
                log_error "Tunnels are already running (PIDs: $FRONTEND_PID, $BACKEND_PID)"
                echo "Run './start_tunnels.sh stop' to stop them first."
                return 1
            fi
        fi
    fi

    log_info "Starting Frontend Tunnel..."
    nohup cloudflared tunnel --url "$FRONTEND_URL" > "$LOG_DIR/frontend_tunnel.log" 2>&1 &
    FRONTEND_PID=$!

    log_info "Starting Backend Tunnel..."
    nohup cloudflared tunnel --url "$BACKEND_URL" > "$LOG_DIR/backend_tunnel.log" 2>&1 &
    BACKEND_PID=$!

    save_pids "$FRONTEND_PID" "$BACKEND_PID"

    echo "Waiting for URLs to be generated... (Please wait, this may take 10-15 seconds)"
    
    local frontend_url=""
    local backend_url=""
    local wait_count=0
    local max_wait=15
    
    # Wait for URLs with retry
    while [ $wait_count -lt $max_wait ]; do
        frontend_url=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_DIR/frontend_tunnel.log" 2>/dev/null | tail -n 1)
        backend_url=$(grep -o 'https://[a-zA-Z0-9-]*\.trycloudflare\.com' "$LOG_DIR/backend_tunnel.log" 2>/dev/null | tail -n 1)
        
        if [ -n "$frontend_url" ] && [ -n "$backend_url" ]; then
            break
        fi
        
        sleep 1
        ((wait_count++))
    done

    echo "========================================="
    echo "               TUNNEL URLs               "
    echo "========================================="

    if [ -n "$frontend_url" ]; then
        echo "Frontend: $frontend_url"
    else
        echo "Frontend: (ERROR - Unable to generate URL)"
        echo "          Make sure frontend is running at: $FRONTEND_URL"
        echo "          Debug with: tail -50 $LOG_DIR/frontend_tunnel.log"
    fi

    if [ -n "$backend_url" ]; then
        echo "Backend:  $backend_url"
    else
        echo "Backend:  (ERROR - Unable to generate URL)"
        echo "          Make sure backend is running at: $BACKEND_URL"
        echo "          Debug with: tail -50 $LOG_DIR/backend_tunnel.log"
    fi

    echo "========================================="
    log_info "Tunnels started (Frontend PID: $FRONTEND_PID, Backend PID: $BACKEND_PID)"
    log_info "Logs are saved in $LOG_DIR/"
    echo ""
    echo "To view full logs:"
    echo "  tail -f $LOG_DIR/frontend_tunnel.log"
    echo "  tail -f $LOG_DIR/backend_tunnel.log"
    echo ""
    if [ -z "$frontend_url" ] || [ -z "$backend_url" ]; then
        log_error "One or more tunnels failed to generate URLs. Check your URLs and make sure services are running."
    fi
}

stop_tunnels() {
    echo "========================================="
    echo "       Stopping Tunnels                  "
    echo "========================================="
    
    if ! load_pids; then
        log_error "No tunnel PIDs found. Are the tunnels running?"
        return 1
    fi

    log_info "Stopping tunnels (PIDs: $FRONTEND_PID, $BACKEND_PID)..."
    
    if kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null; then
        log_info "Tunnels stopped successfully"
        rm -f "$PID_FILE"
        sleep 1
        return 0
    else
        log_error "Failed to stop tunnels. They may not be running."
        return 1
    fi
}

show_status() {
    echo "========================================="
    echo "       Tunnel Status                     "
    echo "========================================="
    
    if ! load_pids; then
        echo "Status: NOT RUNNING (No PID file found)"
        return 1
    fi

    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "Frontend Tunnel: RUNNING (PID: $FRONTEND_PID)"
    else
        echo "Frontend Tunnel: STOPPED"
    fi

    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Backend Tunnel: RUNNING (PID: $BACKEND_PID)"
    else
        echo "Backend Tunnel: STOPPED"
    fi
    
    echo "========================================="
}

show_logs() {
    echo "========================================="
    echo "       Recent Tunnel Logs                "
    echo "========================================="
    
    if [ -f "$LOG_DIR/frontend_tunnel.log" ]; then
        echo "--- Frontend Log ---"
        tail -20 "$LOG_DIR/frontend_tunnel.log"
    fi
    
    echo ""
    
    if [ -f "$LOG_DIR/backend_tunnel.log" ]; then
        echo "--- Backend Log ---"
        tail -20 "$LOG_DIR/backend_tunnel.log"
    fi
}

# ========================================
# Main Script
# ========================================

COMMAND="${1:-start}"

# Parse options
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --frontend-url)
            FRONTEND_URL="$2"
            shift 2
            ;;
        --backend-url)
            BACKEND_URL="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

case $COMMAND in
    start)
        start_tunnels
        ;;
    stop)
        stop_tunnels
        ;;
    restart)
        stop_tunnels
        echo ""
        start_tunnels
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    -h|--help)
        show_help
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
