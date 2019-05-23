import json
import sys
import os

# Idea: instead of single bar for each stream, use two bars where one is the same as it is now and the other shows activity based on prioritization info in some way or another?

# seconds
SCALE = 1000
WITH_TEXT = True
WIDTH_SCALE = 100

# ms
SCALE = 1
WIDTH_SCALE = 1

if len(sys.argv) != 2:
    print("Incorrect arguments. Usage: analyser.py <logname>\nLog should be a client-sided log")
    sys.exit(1)

filename = sys.argv[1]
out = open("visualisation.html", "w")

print("Fix Qlog file? y/n")

executeFix = sys.stdin.read(1) == 'y'

if executeFix:
    with open(filename, "rb+") as log:
        # Temporary until qlog closing brackets are properly handled
        log.seek(-2, os.SEEK_END) # Remove trailing ',' from last line
        log.truncate()
    with open(filename, "a") as log:
        log.write("]}]}") # Close all brackets
        log.seek(0)
with open(filename, "r") as log:
    json = json.load(log)

# Just a few random colours for each stream. If there are more streams than there are colours, the program will throw an index out of range exception
colours = ["#e1d5e7", "#fff2cc", "#d5e8d4", "#f8cecc", "#dae8fc", "#fad7ac"]
border_colours = ["#9f7fae", "#dabd65", "#86b56c", "#b85450", "#7998c5", "#b46504"]

# Id => starttime
active_requests = {}
# Id => HTML div
html_divs = {}
max_time = 0

for row in json["connections"][0]["events"]:
    if row[1] == "HTTP" and row[2] == "GET" and row[3] == "TX":
        print(row)
        active_requests[row[4]["stream_id"]] = row[0]
    elif row[1] == "HTTP" and row[2] == "STREAM_STATE_UPDATE" and row[3] == "FIN" and row[4]["id"] in active_requests:
        if row[0] > max_time:
            max_time = row[0] / SCALE

        start = active_requests[row[4]["id"]]
        end = row[0]
        duration = end - start
        print(row)

        if WITH_TEXT:
            html_divs[int(row[4]["id"])] = str("<div style='clear:both;border:solid " + border_colours[int(row[4]["id"]) // 4] + ";background:" + colours[int(row[4]["id"]) // 4] + ";padding:10px 0px 10px 0px;width:" + str(duration / (SCALE / WIDTH_SCALE)) +"px;margin-left:" + str(start / (SCALE / WIDTH_SCALE)) + "px;'> StreamID: " + str(row[4]["id"]) + "</br> Start: " + str(start / SCALE) + " End: " + str(end / SCALE) + " Duration: " + str(round(duration / SCALE, 5)) + "</div>")
        else:
            html_divs[int(row[4]["id"])] = str("<div style='clear:both;border:solid " + border_colours[int(row[4]["id"]) // 4] + ";background:" + colours[int(row[4]["id"]) // 4] + ";padding:10px 0px 10px 0px;width:" + str(duration / (SCALE / WIDTH_SCALE)) +"px;margin-left:" + str(start / (SCALE / WIDTH_SCALE)) + "px;'> " + str(round(duration / SCALE, 2)) + "</div>")

        del active_requests[row[4]["id"]]

out.write("<div>")
for div in sorted(html_divs.items()):
    print(div[0])
    out.write(div[1])
out.write("</div></br><div style='white-space:nowrap;clear:both;'>")

timeline_iter = 0
while timeline_iter < max_time:
    out.write("<div style='display:inline-block;white-space:normal;border:1px solid black;border-right:none;background: white;padding:10px 0px 10px 0px;width:" + str(1000 / SCALE * WIDTH_SCALE) + "px;margin-left:0px;margin-right:0px;'> t = " + str(timeline_iter) + "</div>")
    timeline_iter += 1000 / SCALE
    print(timeline_iter)

out.write("</div>")

log.close()
out.close()

print("Log processed, output in file 'visualisation.html'")