import json
import sys
import os

if len(sys.argv) != 2:
    print("Incorrect arguments. Usage: qlog_priorities.py <logname>")
    sys.exit(1)

filename = sys.argv[1]
out = open("priority_visualisation.html", "w")

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

for row in json["connections"][0]["events"]:
    if row[1] == "HTTP" and row[2] == "DATA_CHUNK":
        print(row)
        out.write("<div style='float:left;border:solid " + border_colours[int(row[4]["stream_id"]) // 4] + ";background:" + colours[int(row[4]["stream_id"]) // 4] + ";margin:1px;padding:5px 30px;'>ID: " + row[4]["stream_id"] + "<br/>Weight: " + str(row[4]["weight"]).zfill(3) + "<br/>Bytes:" + str(row[4]["byte_length"]) + "</div>")

log.close()
out.close()

print("Log processed, output in file 'priority_visualisation.html'")