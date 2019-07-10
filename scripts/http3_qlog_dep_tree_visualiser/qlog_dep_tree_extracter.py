# Part of the graphviz conversion code was taken from 
# https://stackoverflow.com/questions/40118113/how-to-convert-json-data-into-a-tree-image
# And modified for my needs

import json
import sys
import os
import subprocess

if len(sys.argv) != 2 and len(sys.argv) != 3:
    print("Incorrect argument count. Usage: qlog_dep_tree_extracter.py <logname> (<timeline_output_name>)")
    sys.exit(1)

filename = sys.argv[1]
timeline_output_name = sys.argv[2] if len(sys.argv) == 3 else "dep_tree_timeline.html"
out = open(timeline_output_name, "wb")

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
    json_data = json.load(log)

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

dep_trees = []
timestamps = []
triggers = []

# StreamID => (color, border)
stream_to_color_map = {}

for row in json_data["connections"][0]["events"]:
    if row[1] == "HTTP" and row[2] == "GET":
        path = row[4]["uri"]
        if (path[-1] == "/"):
            path += "index.html"
        head, ext = os.path.splitext(path)
        stream_to_color_map[row[4]["stream_id"]] = extToColorTuple(ext)
    if row[1] == "HTTP" and row[2] == "PRIORITY_CHANGE":
        x = (json.loads(row[4]["new_tree"]))
        dep_trees.append(x)
        timestamps.append(row[0])
        triggers.append(row[3])

dep_tree_edges = [[] for i in range(len(dep_trees))]

def get_edges(tree_dict, index, parent=None):
    identifier = tree_dict["type"] + "_" + tree_dict["id"]
    if parent is not None:
        dep_tree_edges[index].append((parent, identifier))
    for item in tree_dict["children"]:
        get_edges(item, index, parent=identifier)

dotFormattedTrees = ["" for i in range(len(dep_trees))]

def extract_stream_ids(dep_tree):
    stream_ids = []
    for child in dep_tree["children"]:
        stream_ids += extract_stream_ids(child)
    if (dep_tree["type"] == "Request"):
        stream_ids.append(dep_tree["id"])
    return stream_ids

counter = 0
for dep_tree in dep_trees:
    get_edges(dep_tree, counter)

    # Output in json format
    jsonOutput = open("Tree_" + str(counter) + ".json", "w")
    jsonOutput.write(json.dumps(dep_tree, indent=4))
    jsonOutput.close()

    # Dump edge list in Graphviz DOT format
    dotFormattedTrees[counter] += "strict digraph tree {\n\tRoot_ROOT [root=Root_ROOT];\n"

    # coloring
    stream_ids =  extract_stream_ids(dep_tree)
    print(stream_to_color_map)
    for stream_id in stream_ids:
        color, border = stream_to_color_map[stream_id]
        dotFormattedTrees[counter] += '\tRequest_' + stream_id + ' [style=filled,fillcolor="' + color + '", color="' + border + '"];\n'

    for row in dep_tree_edges[counter]:
        dotFormattedTrees[counter] += '\t{0} -> {1};'.format(*row) + "\n"
    dotFormattedTrees[counter] += '}'
    print(dotFormattedTrees[counter])
    counter += 1

counter = 0
out.write("<div style='white-space:nowrap'>".encode("utf-8"))
for tree in dotFormattedTrees:
    p = subprocess.Popen(["dot", "-Tsvg"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    output, err = p.communicate(tree.encode("utf-8"))
    treeOutput = open("Tree_" + str(counter) + ".svg", "wb")
    treeOutput.write(output)
    out.write("<div style='display:inline-block'>".encode("utf-8"))
    out.write(output)
    out.write(("<h1 style='text-align:center'>" + str(timestamps[counter]) + "</h1></br><div style='text-align:center'>Trigger: " + triggers[counter] + "</div></div>").encode("utf-8"))
    treeOutput.close()
    counter += 1
out.write("</div>".encode("utf-8"))

out.close()
