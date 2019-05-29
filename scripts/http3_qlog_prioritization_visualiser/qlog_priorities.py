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

colors = ["#e1d5e7", "#fff2cc", "#d5e8d4", "#f8cecc", "#dae8fc", "#fad7ac", "#f5b449", "#3971ed", "#1ba29b", "#285577"]
border_colors = ["#9f7fae", "#dabd65", "#86b56c", "#b85450", "#7998c5", "#b46504", "#3971ed", "#f5b449", "#d41a1a", "#74508d"]

# (color, border)
def extToColorTuple(ext):
    if ext == ".html":
        return (colors[0], border_colors[0])
    elif ext == ".js":
        return (colors[1], border_colors[1])
    elif ext == ".css":
        return (colors[2], border_colors[2])
    elif ext == ".odt" or ext == ".ttf" or ext == ".woff" or ext == ".woff2":
        return (colors[3], border_colors[3])
    elif ext == ".png" or ext == ".jpg" or ext == ".jpeg" or ext == ".gif":
        return (colors[4], border_colors[4])
    elif ext == ".mp4" or ext == ".webm":
        return (colors[5], border_colors[5])
    elif ext == ".txt":
        return (colors[6], border_colors[6])
    else:
        return ["#FFFFFF", "#FF0000"]

# StreamID => (color, border)
stream_to_color_map = {}
# StreamID => filepath
stream_to_path_map = {}

for row in json["connections"][0]["events"]:
    if row[1] == "HTTP" and row[2] == "GET" and row[3] == "TX":
        path = row[4]["uri"]
        if (path[-1] == "/"):
            path += "index.html"
        head, ext = os.path.splitext(path)
        stream_to_color_map[row[4]["stream_id"]] = extToColorTuple(ext)
        stream_to_path_map[row[4]["stream_id"]] = path

    if row[1] == "HTTP" and row[2] == "DATA_CHUNK" and row[3] == "RX":
        print(row)
        color, border = stream_to_color_map[row[4]["stream_id"]]
        path = (stream_to_path_map[row[4]["stream_id"]][-20:]) # truncate from front
        if len(path) < len(stream_to_path_map[row[4]["stream_id"]]):
            path = "..." + path
        out.write("<div style='float:left;border:solid " + border + ";background:" + color + ";margin:1px;padding:5px 30px;width:12em;'>" + path + "</br>ID: " + row[4]["stream_id"] + "<br/>Weight: " + str(row[4]["weight"]).zfill(3) + "<br/>Bytes:" + str(row[4]["byte_length"]) + "</div>")


log.close()
out.close()

print("Log processed, output in file 'priority_visualisation.html'")