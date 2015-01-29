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

var MODEL_URL = 'model/Cesium_Ground.gltf';
var INIT_LOC = {
  //lat: 37.423501,
  //lon: -122.086744,
	lon : -123.0744619, 
	lat : 44.0503706,
	heading: 90
}; // googleplex

var PREVENT_START_AIRBORNE = true;
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
    
    var r = Cesium.Cartesian3.multiplyByScalar(axis, vDotAxis, new Cesium.Cartesian3());
    var s = Cesium.Cartesian3.multiplyByScalar(vPerpAxis, Math.cos(radians), new Cesium.Cartesian3());
    var t = Cesium.Cartesian3.multiplyByScalar(vPerpPerpAxis, Math.sin(radians), new Cesium.Cartesian3());
    
    var result = Cesium.Cartesian3.add(s, t, t);
    Cesium.Cartesian3.add(r, result, result);
    return result;
}

/*
function makeOrthonormalFrame(matrix, dir, up) {
	var newRight = Cesium.Cartesian3.cross(dir, up, new Cesium.Cartesian3());
	Cesium.Cartesian3.normalize(newRight, newRight);
	
	var newDir = Cesium.Cartesian3.cross(up, newRight, new Cesium.Cartesian3());
	Cesium.Cartesian3.normalize(newDir, newDir);
	
	var newUp = Cesium.Cartesian3.cross(newRight, newDir, new Cesium.Cartesian3());
	
	Cesium.Matrix3.setColumn(matrix, 0, newRight, matrix);
	Cesium.Matrix3.setColumn(matrix, 1, newDir, matrix);
	Cesium.Matrix3.setColumn(matrix, 2, newUp, matrix);
}
*/

function getHeading(matrix, ellipsoid) {
	var position = Cesium.Matrix4.getTranslation(matrix, new Cesium.Cartesian3());
    var transform = Cesium.Transforms.eastNorthUpToFixedFrame(position, ellipsoid);
    Cesium.Matrix3.transpose(transform, transform);
    
    var right = Cesium.Matrix3.getColumn(matrix, 0, new Cesium.Cartesian3());
    var direction = Cesium.Matrix3.getColumn(matrix, 1, new Cesium.Cartesian3());
    
    Cesium.Matrix3.multiplyByVector(transform, right, right);
    Cesium.Matrix3.multiplyByVector(transform, direction, direction);

    var heading;
    if (Math.abs(direction.z) < Math.abs(right.z)) {
        heading = Math.atan2(direction.y, direction.x) - Cesium.Math.PI_OVER_TWO;
    } else {
        heading = Math.atan2(right.y, right.x);
    }

    return Cesium.Math.TWO_PI - Cesium.Math.zeroToTwoPi(heading);
}

// TODO
function getRollFromLocalOrientation(orientation) {
	// orientation is mat3
	return 0.0;
}

function setLocalOrientationRoll(orientation, absRoll) {
	// orientation is mat3
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
  this.localAnchorCartesian = this.ellipsoid.cartographicToCartesian(this.localAnchorLla);
  this.localFrame = Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY);

  // Position, in local cartesian coords.
  this.pos = new Cesium.Cartesian3();
  
  // Velocity, in local cartesian coords.
  this.vel = new Cesium.Cartesian3();

  // Orientation matrix, transforming model-relative coords into local
  // coords.
  this.modelFrame = Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY);

  this.roll = 0;
  this.rollSpeed = 0;
  
  this.idleTimer = 0;
  this.fastTimer = 0;
  this.popupTimer = 0;

  // ge.getOptions().setMouseNavigationEnabled(false);
  // ge.getOptions().setFlyToSpeed(100); // don't filter camera motion
  
  var modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(INIT_LOC.lon, INIT_LOC.lat));
  
  this.model = scene.primitives.add(Cesium.Model.fromGltf({
      url : MODEL_URL,
      modelMatrix : modelMatrix,
      minimumPixelSize : 128
  }));

  var that = this;
  this.model.readyToRender.addEventListener(function(model) {
	  /*
	  walkKmlDom(kml, function() {
	      if (this.getType() == 'KmlPlacemark' && this.getGeometry()
	          && this.getGeometry().getType() == 'KmlModel')
	          me.placemark = this;
	  });
	  */

	  /*
		 * ge.getFeatures().appendChild(me.placemark);
		 * 
		 * me.balloon = ge.createHtmlStringBalloon('');
		 * me.balloon.setFeature(me.placemark); me.balloon.setMaxWidth(350);
		 * me.balloon.setForegroundColor(BALLOON_FG);
		 * me.balloon.setBackgroundColor(BALLOON_BG);
		 */

	  that.teleportTo(INIT_LOC.lon, INIT_LOC.lat, INIT_LOC.heading);

	  that.lastMillis = (new Date()).getTime();

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
	  that.scene.postRender.addEventListener(function() { that.tick(); });

	  /*
		 * // Make sure keyboard focus starts out on the page.
		 * ge.getWindow().blur(); // If the user clicks on the Earth window, try to
		 * restore keyboard // focus back to the page.
		 * google.earth.addEventListener(ge.getWindow(), "mouseup", function(event) {
		 * ge.getWindow().blur(); });
		 */
  });
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
  
  this.cameraFollow(dt);
  return;

  var c0 = 1;
  var c1 = 0;
  
  var gpos = Cesium.Matrix4.getTranslation(this.model.modelMatrix, new Cesium.Cartesian3());
  var lla = this.ellipsoid.cartesianToCartographic(gpos);

  /*
  var temp = Cesium.Cartesian2.clone(this.pos);
  if (Cesium.Cartesian2.magnitude(temp) > 100) {
    // Re-anchor our local coordinate frame whenever we've strayed a
    // bit away from it. This is necessary because the earth is not
    // flat!
    this.adjustAnchor();
  }
  */

  var dir = Cesium.Matrix3.getColumn(this.model.modelMatrix, 1, new Cesium.Cartesian3());
  var up = Cesium.Matrix3.getColumn(this.model.modelMatrix, 2, new Cesium.Cartesian3());

  var absSpeed = Cesium.Cartesian3.magnitude(this.vel);

  var groundAlt = this.scene.globe.getHeight(lla);
  if (!Cesium.defined(groundAlt)) {
	  return;
  }
  
  var airborne = (groundAlt + 0.30 < lla.height);
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
  /*
  makeOrthonormalFrame(this.modelFrame, newdir, up);
  dir = Cesium.Matrix3.getColumn(this.modelFrame, 1, dir);
  up = Cesium.Matrix3.getColumn(this.modelFrame, 2, up);
  */
  
  var right = Cesium.Cartesian3.cross(newdir, up, new Cesium.Cartesian3());
  up = Cesium.Cartesian3.cross(right, newdir, new Cesium.Cartesian3());
  dir = newdir;
  
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
    //var right = Cesium.Matrix3.getColumn(this.modelFrame, 0, new Cesium.Cartesian3());
    var slip = Cesium.Cartesian3.dot(this.vel, right);
    c0 = Math.exp(-dt / 0.5);
    Cesium.Cartesian3.subtract(this.vel, Cesium.Cartesian3.multiplyByScalar(right, slip * (1 - c0), new Cesium.Cartesian3()), this.vel);

    // Apply engine/reverse accelerations.
    forwardSpeed = Cesium.Cartesian3.dot(dir, this.vel);
    if (gasButtonDown) {
      // Accelerate forwards.
      Cesium.Cartesian3.add(this.vel, Cesium.Cartesian3.multiplyByScalar(dir, ACCEL * dt, new Cesium.Cartesian3()), this.vel);
    } else if (reverseButtonDown) {
      if (forwardSpeed > -MAX_REVERSE_SPEED)
        Cesium.Cartesian3.add(this.vel, Cesium.Cartesian3.multiplyByScalar(dir, -DECEL * dt, new Cesium.Cartesian3()), this.vel);
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
    var veldir = Cesium.Cartesian3.normalize(this.vel, new Cesium.Cartesian3());
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
  //Cesium.Cartesian3.add(this.pos, deltaPos, this.pos);

  /*
  Cesium.Cartesian3.add(this.localAnchorCartesian,
                Cesium.Matrix3.multiplyByVector(this.localFrame, this.pos, new Cesium.Cartesian3()), gpos);
  this.ellipsoid.cartesianToCartographic(gpos, lla);
  */
  
  Cesium.Cartesian3.add(deltaPos, gpos, gpos);
  this.ellipsoid.cartesianToCartographic(gpos, lla);
  
  /*
  // Don't go underground.
  groundAlt = this.scene.globe.getHeight(lla);
  if (this.pos.z < groundAlt) {
    this.pos.z = groundAlt;
  }
  */

  /*
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
  this.roll = clamp(this.roll, -30, 30);
  absRoll += this.roll;

  var orientation = Cesium.Matrix4.getRotation(this.model.modelMatrix, new Cesium.Matrix3());
  setLocalOrientationRoll(orientation, absRoll);
  */
  
  Cesium.Cartesian3.negate(right, right);
  var rotation = new Cesium.Matrix3();
  Cesium.Matrix3.setColumn(rotation, 0, dir, rotation);
  Cesium.Matrix3.setColumn(rotation, 1, right, rotation);
  Cesium.Matrix3.setColumn(rotation, 2, up, rotation);
  
  Cesium.Matrix4.fromRotationTranslation(rotation, gpos, this.model.modelMatrix);

  /*
	 * var latLonBox = me.shadow.getLatLonBox(); var radius = .00005;
	 * latLonBox.setNorth(lla[0] - radius); latLonBox.setSouth(lla[0] + radius);
	 * latLonBox.setEast(lla[1] - radius); latLonBox.setWest(lla[1] + radius);
	 * latLonBox.setRotation(-newhtr[0]);
	 */

  //this.tickPopups(dt);
  
  //this.cameraFollow(dt);
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
  var east = Cesium.Matrix3.getColumn(frame, 0, new Cesium.Cartesian3());
  var north = Cesium.Matrix3.getColumn(frame, 1, new Cesium.Cartesian3());
  
  var pos0 = Cesium.Cartesian3.add(pos, east, new Cesium.Cartesian3());
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
  Cesium.Cartesian3.normalize(normal, normal);
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

var PITCH = -Cesium.Math.toRadians(10.0);
var RANGE = Cesium.Cartesian3.magnitude(new Cesium.Cartesian3(TRAILING_DISTANCE, 0.0, CAM_HEIGHT));

Truck.prototype.cameraFollow = function(dt) {
  var camera = this.scene.camera;
  var camHeading = camera.heading - Cesium.Math.PI_OVER_TWO;
  var truckHeading = getHeading(this.model.modelMatrix, this.ellipsoid);
  
  var c0 = Math.exp(-dt / 0.5);
  var c1 = 1 - c0;
  
  var deltaHeading = truckHeading - camHeading;
  var heading = camHeading + c1 * deltaHeading;
  heading = Cesium.Math.zeroToTwoPi(heading);
  
  camera.lookAtTransform(this.model.modelMatrix, new Cesium.HeadingPitchRange(heading, PITCH, RANGE));
};

// heading is optional.
Truck.prototype.teleportTo = function(lon, lat, heading) {
	var cart = Cesium.Cartographic.fromDegrees(lon, lat);
	
	//cart.height = this.scene.globe.getHeight(cart); // TODO
	
	var location = this.ellipsoid.cartographicToCartesian(cart);
	heading = Cesium.Math.toRadians(Cesium.defaultValue(heading, 0.0));
	
	this.model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(location, heading, 0.0, 0.0);
	
	heading = Cesium.Math.zeroToTwoPi(Cesium.Math.PI + heading + Cesium.Math.PI_OVER_FOUR);
	this.scene.camera.lookAtTransform(this.model.modelMatrix, new Cesium.HeadingPitchRange(heading, PITCH, RANGE));
	
	Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, this.vel);
	Cesium.Cartographic.fromDegrees(lat, lon, 0.0, this.localAnchorLla);
	this.ellipsoid.cartographicToCartesian(this.localAnchorLla, this.localAnchorCartesian);

	// make sure to not start airborne
	/*
	// TODO
	if (PREVENT_START_AIRBORNE) {
		window.setTimeout(function() {
			var groundAlt = that.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lat, lon));
			var airborne = groundAlt + 0.30 < that.pos.z;
			if (airborne)
				that.teleportTo(lon, lat, heading);
		}, 500);
	}
	*/
};
