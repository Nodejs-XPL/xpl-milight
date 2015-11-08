var Xpl = require("xpl-api");
var commander = require('commander');
var Milight = require('milight');
var os = require('os');

commander.version(require("./package.json").version);
commander.option("--host <host>", "Hostname of milight gateway");
commander.option("--port <port>", "Port of milight gateway", parseInt);
commander.option("--broadcast", "Use broadcast");
commander.option("--delayBetweenMessages <delay>",
    "Delay between messages (ms)", parseInt);

commander.option("--heapDump", "Enable heap dump (require heapdump)");

Xpl.fillCommander(commander);

commander.command('*').description("Start processing Milight").action(
    function() {
      console.log("Start");

      var milight = new Milight(commander);

      if (!commander.xplSource) {
        var hostName = os.hostname();
        if (hostName.indexOf('.') > 0) {
          hostName = hostName.substring(0, hostName.indexOf('.'));
        }

        commander.xplSource = "milight." + hostName;
      }

      var xpl = new Xpl(commander);

      xpl.on("error", function(error) {
        console.log("XPL error", error);
      });

      xpl.bind(function(error) {
        if (error) {
          console.log("Can not open xpl bridge ", error);
          process.exit(2);
          return;
        }

        console.log("Xpl bind succeed ");
        // xpl.sendXplTrig(body, callback);

        xpl.on("xpl:milight-cmnd", function(message) {
          var zones = milight.allZones();
          if (body.zones !== "all") {
            var zs = [];
            body.zones.split(",").forEach(function(z) {
              zs.push(parseInt(z.trim(), 10));
            });

            zones = milight.zone(zs);
          }

          var brightness = undefined;
          if (body.brightness) {
            brightness = parseInt(body.brightness, 10);
          }

          switch (body.command) {
          case "off":
            zones.off();
            return;
          case "nightMode":
            zones.nightMode();
            return;
          case "on":
            zones.on();
            return;
          case "brightness":
            zones.brightness(brightness);
            return;
          case "white":
            zones.brightness(brightness);
            return;
          case "hsv":
            var hue = undefined;
            if (body.hue) {
              hue = parseInt(body.hue, 10);
            }
            var value = undefined;
            if (body.value) {
              value = parseInt(body.value, 10);
            }
            zones.hsv(hue, undefined, value);
            return;
          case "rgb":
            var red = parseInt(body.red, 10);
            var green = parseInt(body.green, 10);
            var blue = parseInt(body.blue, 10);
            zones.rgb255(red, green, blue);
            return;
          }
        });
      });
    });

commander.parse(process.argv);

if (commander.headDump) {
  var heapdump = require("heapdump");
  console.log("***** HEAPDUMP enabled **************");
}
