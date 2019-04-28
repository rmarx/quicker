import json
import sys

if len(sys.argv) != 2:
    print("Incorrect arguments. Usage: qlog_priorities.py <logname>")
    sys.exit(1)

filename = sys.argv[1]
log = open(filename, "r")
out = open("priority_visualisation.html", "w")
json = json.load(log)

# Just a few random colours for each stream. If there are more streams than there are colours, the program will throw an index out of range exception
colours = ["red", "blue", "green", "pink", "orange", "cyan", "black", "yellow"]

for row in json["connections"][0]["events"]:
    if row[1] == "HTTP" and row[2] == "DATA_CHUNK":
        print(row)
        out.write("<div style='float:left;border:solid " + colours[int(row[4]["stream_id"]) // 4] + ";margin:1px;padding:5px 30px;'>ID: " + row[4]["stream_id"] + "<br/>Weight: " + str(row[4]["weight"]).zfill(3) + "<br/>Bytes:" + str(row[4]["byte_length"]) + "</div>")

log.close()
out.close()

print("Log processed, output in file 'priority_visualisation.html'")