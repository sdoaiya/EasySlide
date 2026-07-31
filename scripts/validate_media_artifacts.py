import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def run(command):
    return subprocess.run(command, capture_output=True, text=True, check=True)


def probe(path):
    completed = run([
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels',
        '-of', 'json',
        str(path),
    ])
    payload = json.loads(completed.stdout)
    duration = float(payload.get('format', {}).get('duration') or 0)
    if duration <= 0:
        raise AssertionError(f'{path} has no readable duration')
    return payload


def audio_peak_db(path):
    completed = subprocess.run(
        ['ffmpeg', '-i', str(path), '-af', 'volumedetect', '-f', 'null', '-'],
        capture_output=True,
        text=True,
        check=False,
    )
    match = re.search(r'max_volume:\s*(-?[\d.]+) dB', completed.stderr)
    if completed.returncode != 0 or not match:
        raise AssertionError(f'{path} peak check failed')
    peak = float(match.group(1))
    if peak > 0:
        raise AssertionError(f'{path} clips at {peak} dB')
    return peak


def validate(path):
    if not path.exists():
        raise AssertionError(f'{path} missing')
    payload = probe(path)
    streams = payload.get('streams', [])
    result = {
        'path': str(path),
        'duration': float(payload['format']['duration']),
        'streams': streams,
    }
    if any(stream.get('codec_type') == 'audio' for stream in streams):
        result['max_volume_db'] = audio_peak_db(path)
    if path.suffix.lower() == '.mp4' and not any(stream.get('codec_type') == 'video' for stream in streams):
        raise AssertionError(f'{path} has no video stream')
    if path.suffix.lower() in {'.mp3', '.wav'} and not any(stream.get('codec_type') == 'audio' for stream in streams):
        raise AssertionError(f'{path} has no audio stream')
    return result


def main():
    parser = argparse.ArgumentParser(description='Validate media artifacts with ffprobe/ffmpeg.')
    parser.add_argument('paths', nargs='+', type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps({'media': [validate(path.resolve()) for path in args.paths]}, ensure_ascii=False))
    except (AssertionError, FileNotFoundError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
