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
	lon : -123.0744619, 
	lat : 44.0503706,
	heading: 90
};

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
	var quaternion = Cesium.Quaternion.fromAxisAngle(axis, radians);
	var rotMat = Cesium.Matrix3.fromQuaternion(quaternion);
	return Cesium.Matrix3.multiplyByVector(rotMat, v, new Cesium.Cartesian3());
}

function makeOrthonormalFrame(matrix, dir, up) {
	var newRight = Cesium.Cartesian3.cross(dir, up, new Cesium.Cartesian3());
	Cesium.Cartesian3.normalize(newRight, newRight);
	
	var newDir = Cesium.Cartesian3.cross(up, newRight, new Cesium.Cartesian3());
	Cesium.Cartesian3.normalize(newDir, newDir);
	
	var newUp = Cesium.Cartesian3.cross(newRight, newDir, new Cesium.Cartesian3());
	
	var rightCart4 = Cesium.Cartesian4.fromElements(newRight.x, newRight.y, newRight.z, 0.0);
	var dirCart4 = Cesium.Cartesian4.fromElements(newDir.x, newDir.y, newDir.z, 0.0);
	var upCart4 = Cesium.Cartesian4.fromElements(newUp.x, newUp.y, newUp.z, 0.0);
	
	Cesium.Matrix4.setColumn(matrix, 0, rightCart4, matrix);
	Cesium.Matrix4.setColumn(matrix, 1, dirCart4, matrix);
	Cesium.Matrix4.setColumn(matrix, 2, upCart4, matrix);
}

function getHeading(matrix, ellipsoid) {
	var position = Cesium.Matrix4.getTranslation(matrix, new Cesium.Cartesian3());
    var transform = Cesium.Transforms.eastNorthUpToFixedFrame(position, ellipsoid);
    Cesium.Matrix3.transpose(transform, transform);
    
    var right = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(matrix, 0, new Cesium.Cartesian4()));
    var direction = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(matrix, 1, new Cesium.Cartesian4()));
    
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

function getRollFromLocalOrientation(matrix, ellipsoid) {
	var position = Cesium.Matrix4.getTranslation(matrix, new Cesium.Cartesian3());
    var transform = Cesium.Transforms.eastNorthUpToFixedFrame(position, ellipsoid);
    Cesium.Matrix3.transpose(transform, transform);
    
    var right = Cesium.Matrix3.getColumn(matrix, 0, new Cesium.Cartesian3());
    var direction = Cesium.Matrix3.getColumn(matrix, 1, new Cesium.Cartesian3());
    var up = Cesium.Matrix3.getColumn(matrix, 2, new Cesium.Cartesian3());
    
    Cesium.Matrix3.multiplyByVector(transform, right, right);
    Cesium.Matrix3.multiplyByVector(transform, direction, direction);
    Cesium.Matrix3.multiplyByVector(transform, up, up);

    var roll = 0.0;
    if (!Cesium.Math.equalsEpsilon(Math.abs(direction.z), 1.0, Cesium.Math.EPSILON3)) {
        roll = Math.atan2(-right.z, up.z);
        roll = Cesium.Math.zeroToTwoPi(roll + Cesium.Math.TWO_PI);
    }

    return roll;
}

function setOrientationRoll(dir, right, up, absRoll) {
	var rotQuat = Cesium.Quaternion.fromAxisAngle(dir, absRoll);
	var rotMat = Cesium.Matrix3.fromQuaternion(rotQuat);
	
	Cesium.Matrix3.multiplyByVector(rotMat, up, up);
	Cesium.Matrix3.multiplyByVector(rotMat, right, right);
}

function Truck(scene) {
  this.scene = scene;
  this.ellipsoid = scene.globe.ellipsoid;
  
  // Velocity, in local cartesian coords.
  this.vel = new Cesium.Cartesian3();

  this.roll = 0;
  this.rollSpeed = 0;
  
  this.idleTimer = 0;
  this.fastTimer = 0;
  this.popupTimer = 0;
  
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
  
  var gpos = Cesium.Matrix4.getTranslation(this.model.modelMatrix, new Cesium.Cartesian3());
  var lla = this.ellipsoid.cartesianToCartographic(gpos);

  var dir = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(this.model.modelMatrix, 1, new Cesium.Cartesian4()));
  var up = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(this.model.modelMatrix, 2, new Cesium.Cartesian4()));

  var absSpeed = Cesium.Cartesian3.magnitude(this.vel);

  var groundAlt = Cesium.defaultValue(this.scene.globe.getHeight(lla), 0.0);
  
  var airborne = (groundAlt + 0.30 < lla.height);
  var steerAngle = 0;
  
  // Steering.
  if (leftButtonDown || rightButtonDown) {
    var TURN_SPEED_MIN = 60.0;  // radians/sec
    var TURN_SPEED_MAX = 100.0;  // radians/sec
 
    var turnSpeed;

    // Degrade turning at higher speeds.
    //
    //           angular turn speed vs. vehicle speed
    //    |     -------
    //    |    /       \-------
    //    |   /                 \-------
    //    |--/                           \---------------
    //    |
    //    +-----+-------------------------+-------------- speed
    //    0    SPEED_MAX_TURN           SPEED_MIN_TURN
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
  makeOrthonormalFrame(this.model.modelMatrix, newdir, up);
  var right = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(this.model.modelMatrix, 0, new Cesium.Cartesian4()));
  var dir = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(this.model.modelMatrix, 1, new Cesium.Cartesian4()));
  var up = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(this.model.modelMatrix, 2, new Cesium.Cartesian4()));
  
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
	  
	var slip = Cesium.Cartesian3.dot(this.vel, dir);
	c0 = Math.exp(-dt / 0.5);
	Cesium.Cartesian3.subtract(this.vel, Cesium.Cartesian3.multiplyByScalar(dir, slip * (1 - c0), new Cesium.Cartesian3()), this.vel);

	// Apply engine/reverse accelerations.
	forwardSpeed = Cesium.Cartesian3.dot(right, this.vel);
	if (gasButtonDown) {
	  // Accelerate forwards.
	  Cesium.Cartesian3.add(this.vel, Cesium.Cartesian3.multiplyByScalar(right, ACCEL * dt, new Cesium.Cartesian3()), this.vel);
	} else if (reverseButtonDown) {
	  if (forwardSpeed > -MAX_REVERSE_SPEED)
	    Cesium.Cartesian3.add(this.vel, Cesium.Cartesian3.multiplyByScalar(right, -DECEL * dt, new Cesium.Cartesian3()), this.vel);
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
  var normal = estimateGroundNormal(this.scene.globe, gpos, this.model.modelMatrix, this.ellipsoid);
  var gravity = Cesium.Cartesian3.multiplyByScalar(normal, -GRAVITY * dt, new Cesium.Cartesian3());
  Cesium.Cartesian3.add(this.vel, gravity, this.vel);

  // Move.
  var deltaPos = Cesium.Cartesian3.multiplyByScalar(this.vel, dt, new Cesium.Cartesian3());
  
  Cesium.Cartesian3.add(deltaPos, gpos, gpos);
  this.ellipsoid.cartesianToCartographic(gpos, lla);
  
  // Don't go underground.
  groundAlt = this.scene.globe.getHeight(lla);
  if (lla.height < groundAlt) {
    lla.height = groundAlt;
    this.ellipsoid.cartographicToCartesian(lla, gpos);
  }
  
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
    /*
    c0 = Math.exp(-dt / 0.25);
    c1 = 1 - c0;
    var scaledUp = Cesium.Cartesian3.multiplyByScalar(up, c0, new Cesium.Cartesian3());
    var scaledNormal = Cesium.Cartesian3.multiplyByScalar(normal, c1, new Cesium.Cartesian3());
    var blendedUp = Cesium.Cartesian3.add(scaledUp, scaledNormal, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(blendedUp, blendedUp);
    makeOrthonormalFrame(this.model.modelMatrix, dir, blendedUp);
    */
  }

  /*
  // Compute roll according to steering.
  // TODO: this would be even more cool in 3d.
  var absRoll = getRollFromLocalOrientation(this.model.modelMatrix, this.ellipsoid);
  absRoll = Cesium.Math.toDegrees(absRoll);
  this.rollSpeed += steerAngle * forwardSpeed * STEER_ROLL;
  // Spring back to center, with damping.
  this.rollSpeed += (ROLL_SPRING * -this.roll + ROLL_DAMP * this.rollSpeed);
  this.roll += this.rollSpeed * dt;
  this.roll = Cesium.Math.clamp(this.roll, -30, 30);
  absRoll += this.roll;

  setOrientationRoll(dir, right, up, Cesium.Math.toRadians(absRoll));
  */
  
  var rotation = new Cesium.Matrix3();
  Cesium.Matrix3.setColumn(rotation, 0, right, rotation);
  Cesium.Matrix3.setColumn(rotation, 1, dir, rotation);
  Cesium.Matrix3.setColumn(rotation, 2, up, rotation);
  
  Cesium.Matrix4.fromRotationTranslation(rotation, gpos, this.model.modelMatrix);

  /*
	 * var latLonBox = me.shadow.getLatLonBox(); var radius = .00005;
	 * latLonBox.setNorth(lla[0] - radius); latLonBox.setSouth(lla[0] + radius);
	 * latLonBox.setEast(lla[1] - radius); latLonBox.setWest(lla[1] + radius);
	 * latLonBox.setRotation(-newhtr[0]);
	 */

  //this.tickPopups(dt);
  
  this.cameraFollow(dt);
};

// TODO: would be nice to have globe.getGroundNormal() in the API.
function estimateGroundNormal(globe, pos, frame, ellipsoid) {
  // Take four height samples around the given position, and use it to
  // estimate the ground normal at that position.
  //  (North)
  //     0
  //     *
  //  2* + *3
  //     *
  //     1
  var east = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(frame, 0, new Cesium.Cartesian4()));
  var north = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(frame, 1, new Cesium.Cartesian4()));
  
  var pos0 = Cesium.Cartesian3.add(pos, east, new Cesium.Cartesian3());
  var pos1 = Cesium.Cartesian3.subtract(pos, east, new Cesium.Cartesian3());
  var pos2 = Cesium.Cartesian3.add(pos, north, new Cesium.Cartesian3());
  var pos3 = Cesium.Cartesian3.subtract(pos, north, new Cesium.Cartesian3());
  
  function getAlt(p) {
    var lla = globe.ellipsoid.cartesianToCartographic(p, new Cesium.Cartographic());
    var height = globe.getHeight(lla);
    return Cesium.defaultValue(height, 0.0);
  }
  
  var dx = getAlt(pos1) - getAlt(pos0);
  var dy = getAlt(pos3) - getAlt(pos2);
  var normal = new Cesium.Cartesian3(dx, dy, 2);
  Cesium.Cartesian3.normalize(normal, normal);
  
  var transform = Cesium.Transforms.eastNorthUpToFixedFrame(pos, ellipsoid);
  Cesium.Matrix4.multiplyByPointAsVector(transform, normal, normal);
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

var PITCH = -Cesium.Math.toRadians(10.0);
var RANGE = Cesium.Cartesian3.magnitude(new Cesium.Cartesian3(TRAILING_DISTANCE, 0.0, CAM_HEIGHT));

Truck.prototype.cameraFollow = function(dt) {
  var camera = this.scene.camera;
  
  var camHeading = camera.heading;
  var truckHeading = Cesium.Math.zeroToTwoPi(getHeading(this.model.modelMatrix, this.ellipsoid) + Cesium.Math.PI_OVER_TWO);
  
  var c0 = Math.exp(-dt / 0.5);
  var c1 = 1 - c0;
  
  var deltaHeading = truckHeading - camHeading;
  var heading = camHeading + c1 * deltaHeading;
  heading = Cesium.Math.zeroToTwoPi(heading);
  
  var truckPosition = Cesium.Matrix4.getTranslation(this.model.modelMatrix, new Cesium.Cartesian3());
  camera.lookAt(truckPosition, new Cesium.HeadingPitchRange(heading, PITCH, RANGE));
};

// heading is optional.
Truck.prototype.teleportTo = function(lon, lat, heading) {
	var cart = Cesium.Cartographic.fromDegrees(lon, lat);
	
	cart.height = this.scene.globe.getHeight(cart);
	if (!Cesium.defined(cart.height)) {
		cart.height = 0.0;
	}
	
	var location = this.ellipsoid.cartographicToCartesian(cart);
	heading = Cesium.Math.toRadians(Cesium.defaultValue(heading, 0.0));
	
	this.model.modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(location, heading, 0.0, 0.0);
	
	heading = Cesium.Math.zeroToTwoPi(Cesium.Math.PI + heading + Cesium.Math.PI_OVER_FOUR);
	this.scene.camera.lookAt(location, new Cesium.HeadingPitchRange(heading, PITCH, RANGE));
};
