#!/bin/zsh
# Drives a full first-night ritual in the IWSDK emulator with natural hand motion.
# Prints elapsed-time markers so the recording can be cut.
cd "$(dirname "$0")/.."
X() { npx @iwsdk/cli "$@" 2>&1; }
T0=$(perl -MTime::HiRes=time -e 'printf "%.2f", time')
mark() { perl -MTime::HiRes=time -e "printf \"%6.1f  $1\n\", time - $T0"; }
seq() { X xr run-sequence --input-json "$1" | grep -qE '"completed": true' || echo "  (sequence incomplete: $2)"; }
file() { # hand mote jar
  seq "{\"device\":\"$1\",\"steps\":[{\"label\":\"grab\",\"target\":\"$2\",\"approach\":{\"distance\":0.06},\"pinch\":{\"value\":1,\"at\":\"arrival\"}},{\"label\":\"carry\",\"target\":\"$3\",\"depart\":{\"distance\":0.05},\"approach\":{\"distance\":0.05},\"duration\":1.1},{\"label\":\"release\",\"pinch\":0,\"duration\":0.2},{\"label\":\"settle\",\"position\":{\"relativeTo\":\"head\",\"x\":$4,\"y\":-0.42,\"z\":-0.3},\"anchor\":\"wrist\",\"duration\":0.7}]}" "$2"
}
mark "start: arrival"
sleep ${1:-3}
mark "pinch ember"
seq '{"device":"hand-right","steps":[{"label":"reach","target":"ember","approach":{"distance":0.06},"pinch":{"value":1,"at":"arrival"}},{"label":"release","pinch":0,"duration":0.25},{"label":"settle","position":{"relativeTo":"head","x":0.22,"y":-0.42,"z":-0.3},"anchor":"wrist","duration":0.8}]}' ember
sleep 2
mark "file thoughts"
file hand-right mote-3 jar-tomorrow 0.22
file hand-right mote-5 jar-release 0.22
file hand-left mote-1 jar-rest -0.22
file hand-left mote-0 jar-release -0.22
file hand-right mote-4 jar-tomorrow 0.22
sleep 1
mark "that's enough"
seq '{"device":"hand-right","steps":[{"label":"reach","target":"enough","approach":{"distance":0.06},"pinch":{"value":1,"at":"arrival"}},{"label":"release","pinch":0,"duration":0.25}]}' enough
mark "breathing"
mvh() { X xr animate-to --input-json "{\"device\":\"hand-$1\",\"position\":{\"x\":$2,\"y\":1.0,\"z\":1.56},\"anchor\":\"wrist\",\"duration\":$3,\"easing\":\"minimum-jerk\"}" >/dev/null; }
X xr animate-to --input-json '{"device":"headset","position":{"x":-0.95,"y":1.22,"z":1.9},"orientation":{"x":-0.1305,"y":0,"z":0,"w":0.9914},"duration":1.2,"easing":"minimum-jerk"}' >/dev/null
# Hands now follow the guide in-page (tools/breath-follow.mjs, installed before recording).
for i in 1 2 3 4 5; do mark "breath $i"; sleep 10; done
sleep 1.5
mark "close"
X xr animate-to --input-json '{"device":"headset","position":{"x":-0.95,"y":1.22,"z":1.9},"orientation":{"x":0.0436,"y":0,"z":0,"w":0.999},"duration":2.5,"easing":"minimum-jerk"}' >/dev/null
sleep 7
mark "moon"
X xr animate-to --input-json '{"device":"headset","position":{"x":-0.95,"y":1.22,"z":1.9},"orientation":{"x":-0.0872,"y":0,"z":0,"w":0.9962},"duration":1.2,"easing":"minimum-jerk"}' >/dev/null
seq '{"device":"hand-right","steps":[{"label":"reach","target":"moon","approach":{"distance":0.06},"pinch":{"value":1,"at":"arrival"}},{"label":"release","pinch":0,"duration":0.25}]}' moon
sleep 3
mark "end"
