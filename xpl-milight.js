var Xpl = require("xpl-api");
var commander = require('commander');
var Milight = require('milight');
var os = require('os');
var debug = require('debug')('xpl-milight');
var Async = require('async');

commander.version(require("./package.json").version);
commander.option("--host <host>", "Hostname of milight gateway");
commander.option("--port <port>", "Port of milight gateway", parseInt);
commander.option("--broadcast", "Use broadcast");
commander.option("--delayBetweenMessages <delay>",
    "Delay between messages (ms)", parseInt);
commander.option("-a, --deviceAliases <aliases>", "Devices aliases");

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

      var deviceAliases = Xpl.loadDeviceAliases(commander.deviceAliases);

      debug("Device aliases=", deviceAliases);

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

        var mcommands = {};
        var timeoutId;
        function onInterval() {

          var ns = [];
          for ( var n in mcommands) {
            var x = mcommands[n];

            x.count--;
            if (x.count < 1) {
              delete mcommands[n];
            }

            ns.push(x);
          }

          debug("onIntervals command=", ns);

          if (!ns.length) {
            timeoutId = undefined;
            return;
          }

          Async.eachSeries(ns, function(n, callback) {
            debug("Call command ", n);
            var first = n.first;
            delete n.first;

            n.func(first, callback);

          }, function(error) {
            debug("End of commands", error);
            if (error) {
              console.error(error);
            }
            timeoutId = setTimeout(onInterval, 200);
          });
        }
        function addCommand(key, func) {
          mcommands[key] = {
            count : 5,
            func : func,
            first : true
          }

          if (!timeoutId) {
            debug("Start timeout ", mcommands);
            timeoutId = setTimeout(onInterval, 200);
          }
        }

        xpl.on("xpl:xpl-cmnd", function(message) {

          debug("Receive message", message);

          if (message.bodyName !== "delabarre.command" &&
              message.bodyName !== "x10.basic") {
            return;
          }

          var body = message.body;

          var command = body.command;
          var device = body.device;

          switch (command) {
          // Xpl-delabarre
          case 'status':
            if (/(enable|enabled|on|1|true)/i.exec(body.current)) {
              command = "on";

            } else if (/(disable|disabled|off|0|false)/i.exec(body.current)) {
              command = "off";
            }
            break;

          // X10
          case 'all_units_off':
          case 'all_lights_off':
            command = "off";
            device = "all";
            break;

          case 'all_units_on':
          case 'all_lights_on':
            command = "on";
            device = "all";
            break;

          case 'bright':
            command = "brightness";
            if (command.data1) {
              current = parseInt(command.data1, 10) / 255 * 100;
            }
            break;
          }

          var targetDevices = [];
          var zones = milight.allZones();
          if (device && device !== "all") {
            var zs = [];
            device.split(",").forEach(function(z) {
              z = z.trim();

              var dev = z;

              if (deviceAliases) {
                var nz = deviceAliases[z];
                if (nz) {
                  debug("Device alias detected ", z, "=>", nz);
                  z = nz;
                }
              }

              if (!/^[0-9]+$/.exec(z)) {
                return;
              }

              zs.push(parseInt(z, 10));
              targetDevices.push(dev);
            });

            if (!zs.length) {
              console.error("No device ", device);
              return;
            }

            zones = milight.zone(zs);
          }

          var targetKeys = targetDevices.join(',');

          debug("Process command", command, "zones=", zones);

          switch (command) {
          case "off":
            debug("Request OFF zones=", targetKeys);
            addCommand(targetKeys, function(first, callback) {
              zones.off(function(error) {
                if (error) {
                  return callback(error);
                }

                if (!first) {
                  return callback();
                }

                Async.eachSeries(targetDevices, function(device, callback) {
                  xpl.sendXplStat({
                    device : device,
                    type : "status",
                    current : "disable"

                  }, "sensor.basic", callback);
                }, callback);
              });
            });
            return;

          case "nightMode":
            debug("Request nightMode zones=", zones);
            zones.nightMode();
            return;

          case "on":
            debug("Request ON zones=", targetKeys);
            addCommand(targetKeys, function(first, callback) {
              zones.on(function(error) {
                if (error) {
                  return callback(error);
                }

                if (!first) {
                  return callback();
                }

                Async.eachSeries(targetDevices, function(device, callback) {
                  xpl.sendXplStat({
                    device : device,
                    type : "status",
                    current : "enable"

                  }, "sensor.basic", callback);
                }, callback);
              });
            });
            return;

          case "brightness":
            var brightness = undefined;
            if (typeof (current) === "string") {
              brightness = parseInt(current, 10);
            }
            debug("Request brightness: ", brightness, "zones=", zones);
            zones.brightness(brightness);
            return;

          case "white":
            var white = undefined;
            if (typeof (current) === "string") {
              white = parseInt(current, 10);
            }
            debug("Request white: ", white, "zones=", zones);
            zones.white(white);
            return;

          case "hsv":
            var hue = undefined;
            if (typeof (body.hue) === "string") {
              hue = parseInt(body.hue, 10);
            }
            var value = undefined;
            if (typeof (body.value) === "string") {
              value = parseInt(body.value, 10);
            }
            debug("Request hsv: hue=", hue, "value=", value, "zones=", zones);
            zones.hsv(hue, undefined, value);
            return;

          case "rgb":
            var red = parseInt(body.red, 10);
            var green = parseInt(body.green, 10);
            var blue = parseInt(body.blue, 10);

            debug("Request rgb255: red=", red, "green=", green, "blue=", blue,
                "zones=", zones);
            addCommand(targetKeys, function(first, callback) {
              zones.rgb255(red, green, blue, function(error) {
                if (error) {
                  return callback(error);
                }

                if (!first) {
                  return callback();
                }

                Async.eachSeries(targetDevices, function(device, callback) {
                  xpl.sendXplStat({
                    device : device,
                    type : "color",
                    current : "rgb(" + red + "," + green + "," + blue + ")"

                  }, "sensor.basic", callback);
                }, callback);
              });
            });
            return;
          }

          console.error("Unsupported command '" + command + "'");
        });
      });
    });

commander.parse(process.argv);

if (commander.headDump) {
  var heapdump = require("heapdump");
  console.log("***** HEAPDUMP enabled **************");
}
