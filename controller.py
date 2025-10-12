"""
Based on https://bharadwaj-raju.github.io/posts/nothing-ear-2-on-linux/
Huge thanks to Bharadwaj Raju for discovering the RFCOMM commands!
"""

import argparse
import socket
from enum import Enum, IntEnum
import logging
import subprocess
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bluetooth address of your Nothing Ear device
DEVICE_ADDR = "3C:B0:ED:F0:BC:2F"
RFCOMM_CHANNEL = 15  # As discovered in the blog post

class COMMANDS(Enum):
    """Control command payloads for Nothing Ear over RFCOMM"""

    ANC_TRANSPARENCY = bytes.fromhex("5560010ff00300cb010700c5af")
    ANC_OFF = bytes.fromhex("5560010ff00300cd010500c447")
    ANC_HIGH = bytes.fromhex("5560010ff00300cf010100e66f")
    ANC_MID = bytes.fromhex("5560010ff00300d5010200e69f")
    ANC_LOW = bytes.fromhex("5560010ff00300d7010300e70f")
    ANC_ADAPTIVE = bytes.fromhex("5560010ff00300dd010400e53f")
    IN_EAR_DETECTION_OFF = bytes.fromhex("55600104f0030025010100b294")
    IN_EAR_DETECTION_ON = bytes.fromhex("55600104f00300260101017310")
    LOW_LATENCY_MODE_OFF = bytes.fromhex("55600140f00200280200a704")
    LOW_LATENCY_MODE_ON = bytes.fromhex("55600140f0020027010097f7")
    GET_DEVICE_INFO = bytes.fromhex("5560011ec00100c00398")
    QUERY = bytes.fromhex("5560011ec001000c039819")

def send_rfcomm(command: COMMANDS):
    """Send a command via Bluetooth RFCOMM to the device"""
    cmd = command.value
    logger.info(f"Connecting to {DEVICE_ADDR} on RFCOMM channel {RFCOMM_CHANNEL}...")

    sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
    try:
        sock.connect((DEVICE_ADDR, RFCOMM_CHANNEL))
        sock.send(cmd)
        logger.info(f"✅ Sent command: {command.name}")
    except OSError as e:
        logger.error(f"❌ Bluetooth error: {e}")
    finally:
        sock.close()


class ANCMode(IntEnum):
    HIGH = 1
    MID = 2
    LOW = 3
    ADAPTIVE = 4
    OFF = 5
    TRANSPARENCY = 7

def set_anc_mode(mode: ANCMode):
    """Set ANC mode on the device"""
    if mode == ANCMode.HIGH:
        send_rfcomm(COMMANDS.ANC_HIGH)
    elif mode == ANCMode.MID:
        send_rfcomm(COMMANDS.ANC_MID)
    elif mode == ANCMode.LOW:
        send_rfcomm(COMMANDS.ANC_LOW)
    elif mode == ANCMode.ADAPTIVE:
        send_rfcomm(COMMANDS.ANC_ADAPTIVE)
    elif mode == ANCMode.OFF:
        send_rfcomm(COMMANDS.ANC_OFF)
    elif mode == ANCMode.TRANSPARENCY:
        send_rfcomm(COMMANDS.ANC_TRANSPARENCY)
    else:
        logger.error("Invalid ANC mode!")

def send_and_receive(cmd: bytes) -> bytes:
    """Send a command and read up to 32 bytes of response."""
    sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
    sock.connect((DEVICE_ADDR, RFCOMM_CHANNEL))
    sock.send(cmd)
    data = sock.recv(32)
    sock.close()
    return data

def query_anc_status() -> ANCMode | None:
    resp = send_and_receive(COMMANDS.QUERY.value)
    # Use the 10th byte (index 9) to determine ANC mode
    if len(resp) >= 10:
        anc_byte = resp[9]
        if anc_byte in [m.value for m in ANCMode]:
            mode = ANCMode(anc_byte)
            logger.info(f"🎧 Current ANC mode: {mode.name}")
            return mode
        else:
            logger.warning(f"⚠️ Unknown ANC mode byte: {anc_byte}")
    else:
        logger.warning(f"⚠️ Response too short: {resp.hex()}")
    return None


def get_battery_level() -> int | None:
    """Get battery level using UPower via dbus"""
    try:
        # Convert MAC address to the format used by UPower
        mac_underscore = DEVICE_ADDR.replace(":", "_")
        device_path = f"/org/freedesktop/UPower/devices/headset_dev_{mac_underscore}"
        
        # Query battery percentage using upower
        result = subprocess.run(
            ["upower", "-i", device_path],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            # Parse the output to find percentage
            for line in result.stdout.split('\n'):
                if 'percentage:' in line:
                    # Extract percentage value (e.g., "percentage: 40%")
                    percentage_str = line.split(':')[1].strip().rstrip('%')
                    try:
                        percentage = int(percentage_str)
                        logger.info(f"🔋 Battery level: {percentage}%")
                        return percentage
                    except ValueError:
                        pass
        
        logger.warning("Could not get battery level from UPower")
        return None
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
        logger.error(f"Error getting battery level: {e}")
        return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Control Nothing Ear ANC over RFCOMM")
    parser.add_argument("--set", choices=[m.name.upper() for m in ANCMode] + [m.name.lower() for m in ANCMode], help="Set ANC mode")
    parser.add_argument("--get", action="store_true", help="Query current ANC mode")
    parser.add_argument("--battery", action="store_true", help="Get battery level")

    args = parser.parse_args()

    if args.set:
        mode = ANCMode[args.set.upper()]
        set_anc_mode(mode)
        logger.info(f"Set to {mode.name}")
        sys.exit(0)
    elif args.get:
        mode = query_anc_status()
        if mode:
            print(mode.name)
        else:
            print("UNKNOWN")
        sys.exit(0)
    elif args.battery:
        battery = get_battery_level()
        if battery is not None:
            print(battery)
        else:
            print("UNKNOWN")
        sys.exit(0)
    else:
        parser.print_help()
