// milktruck.js
/*
Copyright 2008 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Code for Monster Milktruck demo, using Earth Plugin.

window.truck = null;

// Pull the Milktruck model from 3D Warehouse.
var PAGE_PATH = document.location.href.replace(/\/[^\/]+$/, '/');
var MODEL_URL =
  'http://sketchup.google.com/3dwarehouse/download?'
  + 'mid=3c9a1cac8c73c61b6284d71745f1efa9&rtyp=zip&'
  + 'fn=milktruck&ctyp=milktruck';
var INIT_LOC = {
  lat: 37.423501,
  lon: -122.086744,
  heading: 90
}; // googleplex

var PREVENT_START_AIRBORNE = false;
var TICK_MS = 66;

var BALLOON_FG = '#000000';
var BALLOON_BG = '#FFFFFF';

var GRAVITY = 9.8;
var CAM_HEIGHT = 10;
var TRAILING_DISTANCE = 50;

var ACCEL = 50.0;
var DECEL = 80.0;
var MAX_REVERSE_SPEED = 40.0;

var STEER_ROLL = -1.0;
var ROLL_SPRING = 0.5;
var ROLL_DAMP = -0.16;

function rotate(v, axis, radians) {
	// TODO
    var vDotAxis = Cesium.Cartesian3.dot(v, axis);
    
    var vPerpAxis = Cesium.Cartesian3.multiplyByScalar(axis, vDotAxis, new Cesium.Cartesian3());
    Cesium.Cartesian3.subtract(v, vPerpAxis, vPerpAxis);
    
    var vPerpPerpAxis = Cesium.Cartesian3.cross(axis, vPerpAxis, new Cesium.Cartesian3());
    
    var r = Cesium.Cartesian3.multiplyByScalar(axis, vDotAxis, , new Cesium.Cartesian3());
    var s = Cesium.Cartesian3.multiplyByScalar(vPerpAxis, Math.cos(radians), new Cesium.Cartesian3());
    var t = Cesium.Cartesian3.multiplyByScalar(vPerpPerpAxis, Math.sin(radians), new Cesium.Cartesian3());
    
    var result = Cesium.Cartesian3.add(s, t, t);
    Cartesian3.add(r, result, result);
    return result;
}

function makeOrthonormalFrame(matrix, dir, up) {
	var newRight = Cesium.Cartesian3.cross(dir, up, new Cesium.Cartesian3());
	Cartesian3.normalize(newRight, newRight);
	
	var newDir = Cesium.Cartesian3.cross(up, newRight, new Cartesian3());
	Cesium.normalize(newDir, newDir);
	
	var newUp = Cesium.Cartesian3.cross(newRight, newDir);
	
	Cesium.Matrix3.setColumn(matrix, 0, newRight, matrix);
	Cesium.Matrix3.setColumn(matrix, 1, newDir, matrix);
	Cesium.Matrix3.setColumn(matrix, 2, newUp, matrix);
}

function getHeading(matrix) {
	// TODO
	return 0.0;
}

function Truck(scene) {
  this.doTick = true;
  
  this.scene = scene;
  this.ellipsoid = scene.globe.ellipsoid;
  
  // We do all our motion relative to a local coordinate frame that is
  // anchored not too far from us. In this frame, the x axis points
  // east, the y axis points north, and the z axis points straight up
  // towards the sky.
  //
  // We periodically change the anchor point of this frame and
  // recompute the local coordinates.
  this.localAnchorLla = new Cesium.Cartographic();
  this.localAnchorCartesian = ellipsoid.cartographicToCartesian(me.localAnchorLla);
  this.localFrame = Cesium.Matrix3.clone(Matrix3.IDENTITY);

  // Position, in local cartesian coords.
  this.pos = new Cesium.Cartesian3();
  
  // Velocity, in local cartesian coords.
  this.vel = new Cesium.Cartesian3();

  // Orientation matrix, transforming model-relative coords into local
  // coords.
  this.modelFrame = Cesium.Matrix3.clone(Matrix3.IDENTITY);

  this.roll = 0;
  this.rollSpeed = 0;
  
  this.idleTimer = 0;
  this.fastTimer = 0;
  this.popupTimer = 0;

  // ge.getOptions().setMouseNavigationEnabled(false);
  // ge.getOptions().setFlyToSpeed(100); // don't filter camera motion

  // window.google.earth.fetchKml(ge, MODEL_URL,
  // function(obj) { me.finishInit(obj); });
}

Truck.prototype.finishInit = function(model) {
  /*
	 * walkKmlDom(kml, function() { if (this.getType() == 'KmlPlacemark' &&
	 * this.getGeometry() && this.getGeometry().getType() == 'KmlModel')
	 * me.placemark = this; });
	 */

  this.model = model;

  /*
	 * ge.getFeatures().appendChild(me.placemark);
	 * 
	 * me.balloon = ge.createHtmlStringBalloon('');
	 * me.balloon.setFeature(me.placemark); me.balloon.setMaxWidth(350);
	 * me.balloon.setForegroundColor(BALLOON_FG);
	 * me.balloon.setBackgroundColor(BALLOON_BG);
	 */

  this.teleportTo(INIT_LOC.lat, INIT_LOC.lon, INIT_LOC.heading);

  this.lastMillis = (new Date()).getTime();

  /*
	 * var href = window.location.href;
	 * 
	 * me.shadow = ge.createGroundOverlay(''); me.shadow.setVisibility(false);
	 * me.shadow.setIcon(ge.createIcon(''));
	 * me.shadow.setLatLonBox(ge.createLatLonBox(''));
	 * me.shadow.setAltitudeMode(ge.ALTITUDE_CLAMP_TO_SEA_FLOOR);
	 * me.shadow.getIcon().setHref(PAGE_PATH + 'shadowrect.png');
	 * me.shadow.setVisibility(true); ge.getFeatures().appendChild(me.shadow);
	 */

  // google.earth.addEventListener(ge, "frameend", function() { me.tick(); });
  var that = this;
  this.scene.postRender.addEventListener(function() { that.tick(); });

  this.cameraCut();

  /*
	 * // Make sure keyboard focus starts out on the page.
	 * ge.getWindow().blur(); // If the user clicks on the Earth window, try to
	 * restore keyboard // focus back to the page.
	 * google.earth.addEventListener(ge.getWindow(), "mouseup", function(event) {
	 * ge.getWindow().blur(); });
	 */
}

leftButtonDown = false;
rightButtonDown = false;
gasButtonDown = false;
reverseButtonDown = false;

function keyDown(event) {
  if (!event) {
    event = window.event;
  }
  if (event.keyCode == 37) {  // Left.
    leftButtonDown = true;
    event.returnValue = false;
  } else if (event.keyCode == 39) {  // Right.
    rightButtonDown = true;
    event.returnValue = false;
  } else if (event.keyCode == 38) {  // Up.
    gasButtonDown = true;
    event.returnValue = false;
  } else if (event.keyCode == 40) {  // Down.
    reverseButtonDown = true;
    event.returnValue = false;
  } else {
    return true;
  }
  return false;
}

function keyUp(event) {
  if (!event) {
    event = window.event;
  }
  if (event.keyCode == 37) {  // Left.
    leftButtonDown = false;
    event.returnValue = false;
  } else if (event.keyCode == 39) {  // Right.
    rightButtonDown = false;
    event.returnValue = false;
  } else if (event.keyCode == 38) {  // Up.
    gasButtonDown = false;
    event.returnValue = false;
  } else if (event.keyCode == 40) {  // Down.
    reverseButtonDown = false;
    event.returnValue = false;
  }
  return false;
}

function clamp(val, min, max) {
  if (val < min) {
    return min;
  } else if (val > max) {
    return max;
  }
  return val;
}

Truck.prototype.tick = function() {
  var now = (new Date()).getTime();
  // dt is the delta-time since last tick, in seconds
  var dt = (now - this.lastMillis) / 1000.0;
  if (dt > 0.25) {
    dt = 0.25;
  }
  this.lastMillis = now;

  var c0 = 1;
  var c1 = 0;

  var gpos = Cesium.Matrix3.multiplyByVector(this.localFrame, this.pos, new Cesium.Cartesian3());
  Cesium.Cartesian3.add(me.localAnchorCartesian, gpos, gpos);
  var lla = this.ellipsoid.cartesianToCartographic(gpos);

  var temp = Cesium.Cartesian2.clone(this.pos);
  if (Cesium.Cartesian2.magnitude(temp) > 100) {
    // Re-anchor our local coordinate frame whenever we've strayed a
    // bit away from it. This is necessary because the earth is not
    // flat!
    this.adjustAnchor();
  }

  var dir = Cesium.Matrix3.getColumn(this.modelFrame, 1, new Cartesian3());
  var up = Cesium.Matrix3.getColumn(this.modelFrame, 2, new Cartesian3());

  var absSpeed = Cesium.Cartesian3(this.vel);

  var groundAlt = this.scene.globe.getHeight(lla);
  var airborne = (groundAlt + 0.30 < this.pos.z);
  var steerAngle = 0;
  
  // Steering.
  if (leftButtonDown || rightButtonDown) {
    var TURN_SPEED_MIN = 60.0;  // radians/sec
    var TURN_SPEED_MAX = 100.0;  // radians/sec
 
    var turnSpeed;

    // Degrade turning at higher speeds.
    //
    // angular turn speed vs. vehicle speed
    // | -------
    // | / \-------
    // | / \-------
    // |--/ \---------------
    // |
    // +-----+-------------------------+-------------- speed
    // 0 SPEED_MAX_TURN SPEED_MIN_TURN
    var SPEED_MAX_TURN = 25.0;
    var SPEED_MIN_TURN = 120.0;
    if (absSpeed < SPEED_MAX_TURN) {
      turnSpeed = TURN_SPEED_MIN + (TURN_SPEED_MAX - TURN_SPEED_MIN)
                   * (SPEED_MAX_TURN - absSpeed) / SPEED_MAX_TURN;
      turnSpeed *= (absSpeed / SPEED_MAX_TURN);  // Less turn as truck slows
    } else if (absSpeed < SPEED_MIN_TURN) {
      turnSpeed = TURN_SPEED_MIN + (TURN_SPEED_MAX - TURN_SPEED_MIN)
                  * (SPEED_MIN_TURN - absSpeed)
                  / (SPEED_MIN_TURN - SPEED_MAX_TURN);
    } else {
      turnSpeed = TURN_SPEED_MIN;
    }
    if (leftButtonDown) {
      steerAngle = turnSpeed * dt * Math.PI / 180.0;
    }
    if (rightButtonDown) {
      steerAngle = -turnSpeed * dt * Math.PI / 180.0;
    }
  }
  
  // Turn.
  var newdir = airborne ? dir : rotate(dir, up, steerAngle);
  makeOrthonormalFrame(this.modelFrame, newdir, up);
  dir = Cesium.Matrix3.getColumn(this.modelFrame, 1, dir);
  up = Cesium.Matrix3.getColumn(this.modelFrame, 2, up);

  var forwardSpeed = 0;
  
  if (!airborne) {
    // TODO: if we're slipping, transfer some of the slip
    // velocity into forward velocity.

    // Damp sideways slip. Ad-hoc frictiony hack.
    //
    // I'm using a damped exponential filter here, like:
    // val = val * c0 + val_new * (1 - c0)
    //
    // For a variable time step:
    // c0 = exp(-dt / TIME_CONSTANT)
    var right = Cesium.Matrix3.getColumn(this.modelFrame, 0, new Cesium.Cartesian3());
    var slip = Cesium.Cartesian3.dot(this.vel, right);
    c0 = Math.exp(-dt / 0.5);
    Cesium.Cartesian3.subtract(this.vel, Cesium.Cartesian3.multiplyByScalar(right, slip * (1 - c0), new Cesium.Cartesian3()), this.vel);

    // Apply engine/reverse accelerations.
    forwardSpeed = Cesium.Cartesian3.dot(dir, this.vel);
    if (gasButtonDown) {
      // Accelerate forwards.
      Cartesian3.add(this.vel, Cesium.Cartesian3.multiplyByScalar(dir, ACCEL * dt, new Cesium.Cartesian3()), this.vel);
    } else if (reverseButtonDown) {
      if (forwardSpeed > -MAX_REVERSE_SPEED)
        Cartesian3.add(this.vel, Cesium.Cartesian3.multiplyByScalar(dir, -DECEL * dt, new Cesium.Cartesian3()), this.vel);
    }
  }

  // Air drag.
  //
  // Fd = 1/2 * rho * v^2 * Cd * A.
  // rho ~= 1.2 (typical conditions)
  // Cd * A = 3 m^2 ("drag area")
  //
  // I'm simplifying to:
  //
  // accel due to drag = 1/Mass * Fd
  // with Milktruck mass ~= 2000 kg
  // so:
  // accel = 0.6 / 2000 * 3 * v^2
  // accel = 0.0009 * v^2
  absSpeed = Cesium.Cartesian3.magnitude(this.vel);
  if (absSpeed > 0.01) {
    var veldir = Cesium.Cartesian3.normalize(this.vel);
    var DRAG_FACTOR = 0.00090;
    var drag = absSpeed * absSpeed * DRAG_FACTOR;

    // Some extra constant drag (rolling resistance etc) to make sure
    // we eventually come to a stop.
    var CONSTANT_DRAG = 2.0;
    drag += CONSTANT_DRAG;

    if (drag > absSpeed) {
      drag = absSpeed;
    }

    Cesium.Cartesian3.subtract(this.vel, Cesium.Cartesian3.multiplyByScalar(veldir, drag * dt, new Cesium.Cartesian3()), this.vel);
  }

  // Gravity
  this.vel.z -= GRAVITY * dt;

  // Move.
  var deltaPos = Cesium.Cartesian3.multiplyByScalar(this.vel, dt, new Cesium.Cartesian3());
  Cesium.Cartesian3.add(this.pos, deltaPos, this.pos);

  Cesium.Cartesian3.add(this.localAnchorCartesian,
                Cesium.Matrix3.multiplyByVector(this.localFrame, this.pos, new Cesium.Cartesian3()), gpos);
  this.ellipsoid.cartesianToCartographic(gpos, lla);
  
  // Don't go underground.
  groundAlt = this.scene.globe.getHeight(lla);
  if (this.pos.z < groundAlt) {
    this.pos.z = groundAlt;
  }

  var normal = estimateGroundNormal(this.scene.globe, gpos, this.localFrame);
  
  if (!airborne) {
    // Cancel velocity into the ground.
    //
    // TODO: would be fun to add a springy suspension here so
    // the truck bobs & bounces a little.
    var speedOutOfGround = Cesium.Cartesian3.dot(normal, this.vel);
    if (speedOutOfGround < 0) {
      Cesium.Cartesian3.add(this.vel, Cesium.Cartesian3.multiplyByScalar(normal, -speedOutOfGround, new Cesium.Cartesian3()), this.vel);
    }

    // Make our orientation follow the ground.
    c0 = Math.exp(-dt / 0.25);
    c1 = 1 - c0;
    var scaledUp = Cesium.Cartesian3.multiplyByScalar(up, c0, new Cesium.Cartesian3());
    var scaledNormal = Cesium.Cartesian3.multiplyByScalar(normal, c1, new Cesium.Cartesian3());
    var blendedUp = Cesium.Cartesian3.add(scaledUp, scaledNormal, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(blendedUp, blendedUp);
    makeOrthonormalFrame(this.modelFrame, dir, blendedUp);
  }

  // Propagate our state into Earth.
  gpos = Cesium.Cartesian3.add(this.localAnchorCartesian,
                Cesium.Matrix3.multiplyByVector(this.localFrame, this.pos, new Cesium.Cartesian3()), gpos);

  // Compute roll according to steering.
  // TODO: this would be even more cool in 3d.
  var absRoll = getRollFromLocalOrientation(this.modelFrame);
  this.rollSpeed += steerAngle * forwardSpeed * STEER_ROLL;
  // Spring back to center, with damping.
  this.rollSpeed += (ROLL_SPRING * -this.roll + ROLL_DAMP * this.rollSpeed);
  this.roll += this.rollSpeed * dt;
  methis.roll = clamp(this.roll, -30, 30);
  absRoll += this.roll;

  var orientation = Cesium.Matrix4.getRotation(this.model.modelMatrix, new Cesium.Matrix3());
  setLocalOrientationRoll(orientation, absRoll);
  
  Cesium.Matrix4.fromRotationTranslation(orientation, gpos, this.model.modelMatrix);

  /*
	 * var latLonBox = me.shadow.getLatLonBox(); var radius = .00005;
	 * latLonBox.setNorth(lla[0] - radius); latLonBox.setSouth(lla[0] + radius);
	 * latLonBox.setEast(lla[1] - radius); latLonBox.setWest(lla[1] + radius);
	 * latLonBox.setRotation(-newhtr[0]);
	 */

  this.tickPopups(dt);
  
  this.cameraFollow(dt, gpos, this.localFrame);
};

// TODO: would be nice to have globe.getGroundNormal() in the API.
function estimateGroundNormal(globe, pos, frame) {
  // Take four height samples around the given position, and use it to
  // estimate the ground normal at that position.
  // (North)
  // 0
  // *
  // 2* + *3
  // *
  // 1
  var east = Cesium.Cartesian3.Matrix3.getColumn(frame, 0, new Cesium.Cartesian3());
  var north = Cesium.Cartesian3.Matrix3.getColumn(frame, 1, new Cesium.Cartesian3());
  
  var pos0 = Cesium.Cartesian3.add(pos, east, new Cartesian3());
  var pos1 = Cesium.Cartesian3.subtract(pos, east, new Cesium.Cartesian3());
  var pos2 = Cesium.Cartesian3.add(pos, north, new Cesium.Cartesian3());
  var pos3 = Cesium.Cartesian3.subtract(pos, north, new Cesium.Cartesian3());
  
  function getAlt(p) {
    var lla = globe.ellipsoid.cartesianToCartographic(p, new Cesium.Cartographic());
    return globe.getHeight(lla);
  }
  
  var dx = getAlt(pos1) - getAlt(pos0);
  var dy = getAlt(pos3) - getAlt(pos2);
  var normal = new Cesium.Cartesian3(dx, dy, 2);
  Cartesian3.normalize(normal, normal);
  return normal;
}

// Decide when to open & close popup messages.
Truck.prototype.tickPopups = function(dt) {
  var speed = Cesium.Cartesian3.magnitude(this.vel);
  if (this.popupTimer > 0) {
	  this.popupTimer -= dt;
	  this.idleTimer = 0;
	  this.fastTimer = 0;
    if (this.popupTimer <= 0) {
    	this.popupTimer = 0;
    	// TODO
      // ge.setBalloon(null);
    }
  } else {
    if (speed < 20) {
    	this.idleTimer += dt;
      if (this.idleTimer > 10.0) {
    	  this.showIdlePopup();
      }
      this.fastTimer = 0;
    } else {
    	this.idleTimer = 0;
      if (speed > 80) {
    	  this.fastTimer += dt;
        if (this.fastTimer > 7.0) {
        	this.showFastPopup();
        }
      } else {
    	  this.fastTimer = 0;
      }
    }
  }
};

var IDLE_MESSAGES = [
    "Let's deliver some milk!",
    "Hello?",
    "Dude, <font color=red><i>step on it!</i></font>",
    "I'm sitting here getting sour!",
    "We got customers waiting!",
    "Zzzzzzz",
    "Sometimes I wish I worked for UPS."
                     ];
Truck.prototype.showIdlePopup = function() {
  this.popupTimer = 2.0;
  var rand = Math.random();
  var index = Math.floor(rand * IDLE_MESSAGES.length)
    % IDLE_MESSAGES.length;
  var message = "<center>" + IDLE_MESSAGES[index] + "</center>";
  // TODO
  // me.balloon.setContentString(message);
  // ge.setBalloon(me.balloon);
};

var FAST_MESSAGES = [
    "Whoah there, cowboy!",
    "Wheeeeeeeeee!",
    "<font size=+5 color=#8080FF>Creamy!</font>",
    "Hey, we're hauling glass bottles here!"
                     ];
Truck.prototype.showFastPopup = function() {
  this.popupTimer = 2.0;
  var rand = Math.random();
  var index = Math.floor(rand * FAST_MESSAGES.length)
    % FAST_MESSAGES.length;
  var message = "<center>" + FAST_MESSAGES[index] + "</center>";
  // TODO
  // me.balloon.setContentString(message);
  // ge.setBalloon(me.balloon);
};

Truck.prototype.scheduleTick = function() {
	if (this.doTick) {
		var that = this;
		setTimeout(function() { that.tick(); }, TICK_MS);
	}
};

// Cut the camera to look at me.
Truck.prototype.cameraCut = function() {
  // TODO
  // var lo = me.model.getLocation();
  // var la = ge.createLookAt('');
  // la.set(lo.getLatitude(), lo.getLongitude(),
  // 10 /* altitude */,
  // ge.ALTITUDE_RELATIVE_TO_SEA_FLOOR,
  // fixAngle(180 + me.model.getOrientation().getHeading() + 45),
  // 80, /* tilt */
  // 50 /* range */
  // );
  // ge.getView().setAbstractView(la);
	
	var camera = this.scene.camera;
	var heading = fixAngle(180 + Cesium.Math.toDegrees(getHeading(this.model.modelMatrix)) + 45);
	
	var modelPosition = Cesium.Matrix4.getTranslation(this.model.modelMatrix, new Cesium.Cartesian3());
	Cesium.Cartesian3.clone(modelPosition, camera.position);
	camera.heading = Cesium.Math.toRadians(heading);
	
	var offset = Cesium.Cartesian3.clone(camera.direction);
	Cesium.Cartesian3.multiplyByScalar(offset, 50.0, offset);
	Cesium.Cartesian3.negate(offset, offset);
	Cesium.Cartesian3.add(camera.position, offset, camera.position);
	
	var modelCart = this.ellipsoid.cartesianToCartographic(camera.position);
	modelCart.height = 10.0;
	this.ellipsoid.cartographicToCartesian(modelCart, camera.position);
	
	var direction = Cesium.Cartesian3.subtract(modelPosition, camera.position, new Cesium.Cartesian3());
	Cesium.Cartesian3.normalize(direction, direction);
	var up = this.ellipsoid.geodeticSurfaceNormal(modelPosition);
	var right = Cesium.Cartesian3.cross(direction, up, new Cesium.Cartesian3());
	Cesium.Cartesian3.normalize(right, right);
	Cesium.Cartesian3.cross(right, direction, up);
	
	Cesium.Cartesian3.clone(direction, camera.direction);
	Cesium.Cartesian3.clone(up, camera.up);
	Cesium.Cartesian3.clone(right, camera.right);
};

Truck.prototype.cameraFollow = function(dt, truckPos, localToGlobalFrame) {
  var c0 = Math.exp(-dt / 0.5);
  var c1 = 1 - c0;

  var camera = this.scene.camera;

  var truckHeading = Cesium.Math.toDegrees(getHeading(this.model.modelMatrix));
  var heading = CesiumMath.toDegrees(camera.heading);
  
  var deltaHeading = fixAngle(truckHeading - camHeading);
  var heading = camHeading + c1 * deltaHeading;
  heading = fixAngle(heading);

  var headingRadians = heading / 180 * Math.PI;
  
  var dir = Cesium.Matrix3.getColumn(localToGlobalFrame, 1, new Cesium.Cartesian3());
  var up = Cesium.Matrix3.getColumn(localToGlobalFrame, 2, new Cesium.Cartesian3());
  
  var headingDir = rotate(dir, up, -headingRadians);
  var camPos = Cesium.Cartesian3.add(truckPos, Cesium.Cartesian3.multiplyByScalar(up, CAM_HEIGHT, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  camPos = Cesium.Cartesian3.add(camPos, Cesium.Cartesian3.multiplyByScalar(headingDir, -TRAILING_DISTANCE, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  var camLla = this.ellipsoid.cartesianToCartographic(camPos, new Cesium.Cartographic());
  var camLla.height = camLla.height - this.scene.globe.getHeight(camLla);
  
  this.ellipsoid.cartographicToCartesian(camLla, camera.position);
  camera.heading = headingRadians;
  
  // TODO
  // camera.tilt = Cesium.Math.toRadians(80.0);
  
  // la.set(camLat, camLon, camAlt, ge.ALTITUDE_RELATIVE_TO_SEA_FLOOR,
  // heading, 80 /*tilt*/, 0 /*range*/);
  // ge.getView().setAbstractView(la);
};

// heading is optional.
Truck.prototype.teleportTo = function(lat, lon, heading) {
	var cart = Cesium.Cartographic.fromDegrees(lat, lon);
	cart.height = this.scene.globe.getHeight(cart);
	
	var location = this.ellipsoid.cartographicToCartesian(cart);
	var translation = new Cesium.Cartesian4(location.x, location.y, location.z, 1.0);
	Cesium.Matrix4.setColumn(this.model.modelMatrix, 3, translation, this.model.modelMatrix);
	if (!Cesium.defined(heading)) {
		heading = 0.0;
	}
	
	Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, this.vel);
	Cesium.Cartographic.fromDegrees(lat, lon, 0.0, this.localAnchorLla);
	this.ellipsoid.cartographicToCartesian(this.localAnchorLla, this.localAnchorCartesian);
	
	var eastNorthUp = Cesium.Transforms.eastNorthUpToFixedFrame(this.localAnchorCartesian, this.ellipsoid);
	Cesium.Matrix4.getRotation(eastNorthUp, this.localFrame);
	Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY, this.modelFrame);

	var axis = Cesium.Matrix3.getColumn(this.modelFrame, 2, new Cesium.Cartesian3());
	var right = Cesium.Matrix3.getColumn(this.modelFrame, 0, new Cesium.Cartesian3());
	right = rotate(right, axis, -heading);
	Cesium.Matrix3.setColumn(this.modelFrame, 0, right, this.modelFrame);
	var dir = Cesium.Matrix3.getColumn(this.modelFrame, 1, new Cesium.Cartesian3());
	dir = rotate(dir, axis, -heading);
	Cesium.Matrix3.setColumn(this.modelFrame, 1, dir, this.modelFrame);
	
	Cesium.Cartesian3.fromElements(0.0, 0.0, cart.height, this.pos);

	this.cameraCut();

	// make sure to not start airborne
	if (PREVENT_START_AIRBORNE) {
		var that = this;
		window.setTimeout(function() {
			var groundAlt = that.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lat, lon));
			var airborne = (groundAlt + 0.30 < that.pos.z);
			if (airborne)
				that.teleportTo(lat, lon, heading);
		}, 500);
	}
};

// Move our anchor closer to our current position. Retain our global
// motion state (position, orientation, velocity).
Truck.prototype.adjustAnchor = function() {
  var oldLocalFrame = this.localFrame;

  var globalPos = Cesium.Cartesian3.add(this.localAnchorCartesian,
                         Cesium.Matrix3.multiplyByVector(oldLocalFrame, this.pos, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  var newAnchorLla = this.ellipsoid.cartesianToCartographic(globalPos);
  newAnchorLla.height = 0;  // For convenience, anchor always has 0 altitude.

  var newAnchorCartesian = this.ellipsoid.cartographicToCartesian(newAnchorLla);
  var eastNorthUp = Cesium.Transforms.eastNorthUpToFixedFrame(newAnchorCartesian, this.ellipsoid);
  var newLocalFrame = Cesium.Matrix4.getRotation(eastNorthUp, new Cesium.Matrix3());

  var newLocalFrameTranspose = Cesium.Matrix3.transpose(newLocalFrame, new Cesium.Matrix3());
  var oldFrameToNewFrame = Cesium.Matrix3.multiply(newLocalFrameTranspose, oldLocalFrame,  new Cesium.Matrix3());

  var newVelocity = Cesium.Matrix3.multiplyByVector(oldFrameToNewFrame, this.vel, new Cesium.Cartesian3());
  var newModelFrame = Cesium.Matrix3.multiply(oldFrameToNewFrame, this.modelFrame, new Cesium.Matrix3());
  var newPosition = Cesium.Cartesian3.subtract(globalPos, newAnchorCartesian, new Cartesian3());
  Cesium.Matrix3.multiplyByVector(newLocalFrameTranspose, newPosition, newPosition);

  Cesium.Cartographic.clone(newAnchorLla, this.localAnchorLla);
  Cesium.Cartesian3.clone(newAnchorCartesian, this.localAnchorCartesian);
  Cesium.Matrix3.clone(newLocalFrame, this.localFrame);
  Cesium.Matrix3.clone(newModelFrame, this.modelFrame);
  Cesium.Cartesian3.clone(newPosition, this.pos);
  Cesium.Cartesian3.clone(newVelocity, this.vel);
}

// Keep an angle in [-180,180]
function fixAngle(a) {
  while (a < -180) {
    a += 360;
  }
  while (a > 180) {
    a -= 360;
  }
  return a;
}
