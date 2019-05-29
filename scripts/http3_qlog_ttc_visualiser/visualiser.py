import json
import sys
import os
import matplotlib.pyplot as pyplot
import numpy as np
from operator import itemgetter

if len(sys.argv) != 3:
    print("Incorrect argument count. Usage: visualiser.py <schemename> <logname>")
    print("Log must be client sided")
    sys.exit(1)

scheme_name = sys.argv[1]
log_filename = sys.argv[2]
figure_output_name = scheme_name + ".pdf"
out = open(figure_output_name, "wb")

print("Fix Qlog file? y/n")

executeFix = sys.stdin.read(1) == 'y'

if executeFix:
    with open(log_filename, "rb+") as log:
        # Temporary until qlog closing brackets are properly handled
        log.seek(-2, os.SEEK_END) # Remove trailing ',' from last line
        log.truncate()
    with open(log_filename, "a") as log:
        log.write("]}]}") # Close all brackets
        log.seek(0)
with open(log_filename, "r") as log:
    json_data = json.load(log)

# Id => filename
requested_files = {}
# id => timestamp
end_times = {}

# StreamID => (color, border)
stream_to_color_map = {}

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

figure, axis = pyplot.subplots()
pyplot.title("Scheme: " + scheme_name)
pyplot.ylabel("Time to completion (ms)")

for row in json_data["connections"][0]["events"]:
    print(row)
    if row[1] == "HTTP" and row[2] == "GET" and row[3] == "TX":
        requested_files[row[4]["stream_id"]] = row[4]["uri"]
        
        path = row[4]["uri"]
        if (path[-1] == "/"):
            path += "index.html"
        head, ext = os.path.splitext(path)
        stream_to_color_map[row[4]["stream_id"]] = extToColorTuple(ext)
    if row[1] == "HTTP" and row[2] == "STREAM_STATE_UPDATE" and row[3] == "FIN":
        end_times[row[4]["id"]] = row[0]

# [(stream_id, end_time, filename)]
metadata = []

for stream_id in end_times.keys():
    if stream_id in requested_files:
        metadata.append((int(stream_id), end_times[stream_id], requested_files[stream_id]))
    else:
        # Is not really an assumption I can make
        print("Mismatch in GET requests and closed streams")
        sys.exit(1)

print(metadata)
metadata.sort(key=itemgetter(0))

filenames = [str(i[0]) + ": " + str(i[2]) for i in metadata]
time_values = [i[1] for i in metadata]

bar_list = axis.bar(filenames, time_values, width=0.5)

for index, bar in enumerate(bar_list):
    color, border = stream_to_color_map[str(metadata[index][0])]
    bar.set_color(color)
    bar.set_edgecolor(border)

rects = axis.patches

# Labeling taken from https://stackoverflow.com/a/28931750
for rect, label in zip(rects, time_values):
    height = rect.get_height()
    axis.text(rect.get_x() + rect.get_width() / 2, height + 5, label,
            ha='center', va='bottom')

figure.autofmt_xdate(rotation=20)
width, height = figure.get_size_inches()
print(width)
print(height)
figure.set_size_inches(0.75 * len(metadata), height)

figure.savefig(figure_output_name)