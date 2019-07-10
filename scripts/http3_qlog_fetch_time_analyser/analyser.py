import json
import sys
import os

# Idea: instead of single bar for each stream, use two bars where one is the same as it is now and the other shows activity based on prioritization info in some way or another?

# seconds
SCALE = 1000
WITH_TEXT = True
WIDTH_SCALE = 100
CHUNK_SIZE = 1000
SCHEDULE_INTERVAL = 10 # ms

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

# Id => starttime
active_requests = {}

# Id => HTML div
html_divs = {}

# {
#    start,
#    stop,
#    stream_id
# }[]
activity_list = []

# (timestamp, stream_id, bytecount)[]
chunk_list = []

# StreamID => (color, border)
stream_to_color_map = {}

last_active_stream = None

max_time = 0

for row in json["connections"][0]["events"]:
    if row[1] == "HTTP" and row[2] == "GET" and row[3] == "TX":
        print(row)
        active_requests[row[4]["stream_id"]] = row[0]
        if last_active_stream == None:
            activity_list.append({
                "start": row[0],
                "stop": None,
                "stream_id": int(row[4]["stream_id"])
            })
            last_active_stream = row[4]["stream_id"]
        path = row[4]["uri"]
        if (path[-1] == "/"):
            path += "index.html"
        head, ext = os.path.splitext(path)
        stream_to_color_map[row[4]["stream_id"]] = extToColorTuple(ext)
        

    elif row[1] == "HTTP" and row[2] == "DATA_CHUNK" and row[3] == "RX":
        chunk_list.append((row[0], row[4]["stream_id"], row[4]["byte_length"]))

        if len(activity_list) > 0 and last_active_stream != row[4]["stream_id"]:
            if activity_list[len(activity_list)-1]["stop"] == None:
                activity_list[len(activity_list)-1]["stop"] = row[0]
            activity_list.append({
                "start": row[0],
                "stop": None,
                "stream_id": int(row[4]["stream_id"])
            })
        last_active_stream = row[4]["stream_id"]
    elif row[1] == "HTTP" and row[2] == "STREAM_STATE_UPDATE" and row[3] == "FIN" and row[4]["id"] in active_requests:
        if row[0] > max_time:
            max_time = row[0] / SCALE
        
        if len(activity_list) > 0 and activity_list[len(activity_list)-1]["stream_id"] == int(row[4]["id"]) and activity_list[len(activity_list)-1]["stop"] == None:
            activity_list[len(activity_list) - 1]["stop"] = row[0]
            last_active_stream = None

        start = active_requests[row[4]["id"]]
        end = row[0]
        duration = end - start
        print(row)
        color, border = stream_to_color_map[row[4]["id"]]

        if WITH_TEXT:
            html_divs[int(row[4]["id"])] = str("<div style='clear:both;position:relative;box-sizing:border-box;box-shadow:0px 0px 0px 3px " + border + " inset;background:" + color + ";padding:5px;width:" + str(duration / (SCALE / WIDTH_SCALE)) +"px;margin-left:" + str(start / (SCALE / WIDTH_SCALE)) + "px;'> <div style='z-index:999;position:absolute;top:5px;left:5px;'>StreamID: " + str(row[4]["id"]) + "</br> Start: " + str(start / SCALE) + " End: " + str(end / SCALE) + " Duration: " + str(round(duration / SCALE, 5)) + "</div><div style='visibility:hidden;'>StreamID: " + str(row[4]["id"]) + "</br> Start: " + str(start / SCALE) + " End: " + str(end / SCALE) + " Duration: " + str(round(duration / SCALE, 5)) + "</div>")
        else:
            html_divs[int(row[4]["id"])] = str("<div style='clear:both;box-sizing:border-box;box-shadow:0px 0px 0px 3px " + border + " inset;background:" + color + ";padding:0px;width:" + str(duration / (SCALE / WIDTH_SCALE)) +"px;margin-left:" + str(start / (SCALE / WIDTH_SCALE)) + "px;'> " + str(round(duration / SCALE, 2)))

        #del active_requests[row[4]["id"]]

out.write("<div>")
for div in sorted(html_divs.items()):
    print(div[0])
    out.write(div[1])

    # Display chunks inside the bar
    z_index = 1
    start = active_requests[str(div[0])]
    for chunk in chunk_list:
        # Only add if chunk is from same stream
        if (int(chunk[1]) == div[0]):
            margin_left = chunk[0] - start
            stream_id = int(chunk[1])
            bytecount = chunk[2]
            width = (bytecount / (CHUNK_SIZE / SCHEDULE_INTERVAL))
            color, border = stream_to_color_map[str(div[0])]
            out.write("<div style='box-sizing:border-box;top:0px;position:absolute;box-shadow:0px 0px 0px 3px " + border + " inset;background:" + border + ";z-index:" + str(z_index) + ";height:100%;width:" + str(width) +"px;left:" + str((margin_left / (SCALE / WIDTH_SCALE)) - (width / (SCALE / WIDTH_SCALE))) + "px;'></div>")
            z_index += 1

    out.write("</div>")

# Activity bar
# out.write("</div></br><div style='white-space:nowrap;clear:both;'>")

# offset = 0
# for activity in activity_list:
#     stream_id = activity["stream_id"]
#     duration = (activity["stop"] - activity["start"]) / (SCALE / WIDTH_SCALE)
#     left_margin = (activity["start"] / (SCALE / WIDTH_SCALE)) - offset 
#     offset = activity["stop"] / (SCALE / WIDTH_SCALE)
#     out.write("<div style='display:inline-block;white-space:normal;box-sizing:border-box;box-shadow:0px 0px 0px 3px " + border_colors[stream_id // 4] + " inset;background:" + colors[stream_id // 4] +";padding:20px 0px 20px 0px;width:" + str(duration) + "px;margin-left:" + str(left_margin) + "px;margin-right:0px;'></div>")

out.write("</div></br><div style='white-space:nowrap;clear:both;'>")

timeline_iter = 0
while timeline_iter < max_time:
    out.write("<div style='display:inline-block;white-space:normal;box-sizing:border-box;box-shadow:0px 0px 0px 3px black inset;background: white;padding:10px 0px 10px 10px;width:" + str(1000 / SCALE * WIDTH_SCALE) + "px;margin-left:0px;margin-right:0px;'> t = " + str(timeline_iter) + "</div>")
    timeline_iter += 1000 / SCALE

# Waterfall of chunks
# out.write("</div></br><div style='white-space:nowrap;clear:both;'>")

# for chunk in chunk_list:
#     timestamp = chunk[0]
#     stream_id = int(chunk[1])
#     bytecount = chunk[2]
#     width = (bytecount / (CHUNK_SIZE / SCHEDULE_INTERVAL)) / (SCALE / WIDTH_SCALE)
#     out.write("<div style='clear:both;box-sizing:border-box;box-shadow:0px 0px 0px 3px " + border_colors[stream_id // 4] + " inset;background:" + colors[stream_id // 4] + ";padding:10px 0px 10px 0px;width:" + str(width) +"px;margin-left:" + str((timestamp / (SCALE / WIDTH_SCALE)) - (width)) + "px;'></div>")

out.write("</div>")

log.close()
out.close()

print("Log processed, output in file 'visualisation.html'")