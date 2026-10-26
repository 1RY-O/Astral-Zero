/**
 * Solar Sentinel - Orbital Calculation Engine
 * ===========================================================
 * Uses satellite.js to propagate TLEs and calculate 2D (x, y) coordinates
 * for orbital visualization. Maps latitude/longitude to a flat 2D map space
 * (size 800x600) and calculates risk levels based on proximity to Earth.
 */

import * as satellite from 'satellite.js';

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const MAP_CENTER_X = MAP_WIDTH / 2;
const MAP_CENTER_Y = MAP_HEIGHT / 2;
const EARTH_RADIUS_KM = 6371;

/**
 * Convert spherical coordinates (lat, lon) to 2D map coordinates
 */
function latLonToMapXY(latitude, longitude) {
  // Equirectangular projection
  const x = MAP_CENTER_X + (longitude * (MAP_WIDTH / 360));
  const y = MAP_CENTER_Y - (latitude * (MAP_HEIGHT / 180));
  
  return { x, y };
}

/**
 * Calculate distance between two points in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const latRad1 = (lat1 * Math.PI) / 180;
  const lonRad1 = (lon1 * Math.PI) / 180;
  const latRad2 = (lat2 * Math.PI) / 180;
  const lonRad2 = (lon2 * Math.PI) / 180; // FIXED: Was missing this line
  
  const dLat = latRad2 - latRad1;
  const dLon = lonRad2 - lonRad1;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
             Math.cos(latRad1) * Math.cos(latRad2) *
             Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate risk level based on proximity to Earth and other objects
 */
function calculateRiskLevel(altitude, distanceToOtherObjects, velocity) {
  let riskScore = 1; // Start with minimum risk
  
  if (altitude < 200) riskScore += 3;
  else if (altitude < 500) riskScore += 2;
  else if (altitude < 1000) riskScore += 1;
  
  if (distanceToOtherObjects < 1) riskScore += 4;
  else if (distanceToOtherObjects < 10) riskScore += 3;
  else if (distanceToOtherObjects < 50) riskScore += 2;
  else if (distanceToOtherObjects < 100) riskScore += 1;
  
  if (velocity > 10) riskScore += 2;
  else if (velocity > 5) riskScore += 1;
  
  return Math.min(riskScore, 10);
}

/**
 * Convert TLE to satellite object and propagate to current position
 */
export function propagateSatellite(tleData, timeOffset = 0) {
  try {
    // FIXED: Correct function name is twoline2satrec
    const sat = satellite.twoline2satrec(tleData.tleLine1, tleData.tleLine2);
    
    const now = new Date();
    const futureTime = new Date(now.getTime() + (timeOffset * 1000));
    
    const positionAndVelocity = satellite.propagate(sat, futureTime);
    
    if (!positionAndVelocity || !positionAndVelocity.position) {
      throw new Error('Failed to propagate satellite position');
    }
    
    // FIXED: Convert ECI to Geodetic correctly using GMST
    const gmst = satellite.gstime(futureTime);
    const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    
    const lat = satellite.degreesLat(positionGd.latitude);
    const lon = satellite.degreesLong(positionGd.longitude);
    const altitude = positionGd.height;
    
    // Get velocity magnitude
    const velocity = positionAndVelocity.velocity 
      ? Math.sqrt(
          positionAndVelocity.velocity.x**2 + 
          positionAndVelocity.velocity.y**2 + 
          positionAndVelocity.velocity.z**2
        ) 
      : 0;
    
    const mapCoords = latLonToMapXY(lat, lon);
    
    return {
      latitude: lat,
      longitude: lon,
      altitude: altitude,
      velocity: velocity,
      x: mapCoords.x,
      y: mapCoords.y,
      timestamp: futureTime.toISOString(),
    };
    
  } catch (error) {
    console.error('[Solar Sentinel] Error propagating satellite:', error);
    return null;
  }
}

/**
 * Calculate risk level for a satellite relative to other objects
 */
export function calculateSatelliteRisk(satellitePos, otherSatellites = []) {
  if (!satellitePos) return 10;
  
  let minDistanceToOther = Infinity;
  
  for (const other of otherSatellites) {
    if (other && other.latitude && other.longitude) {
      const distance = calculateDistance(
        satellitePos.latitude, satellitePos.longitude,
        other.latitude, other.longitude
      );
      minDistanceToOther = Math.min(minDistanceToOther, distance);
    }
  }
  
  return calculateRiskLevel(
    satellitePos.altitude || 0,
    minDistanceToOther,
    satellitePos.velocity || 0
  );
}

/**
 * Process multiple TLE objects and return their positions and risk levels
 */
export async function processOrbitalData(tleObjects, timeOffset = 0) {
  if (!tleObjects || tleObjects.length === 0) {
    console.warn('[Solar Sentinel] No TLE objects provided for processing');
    return [];
  }
  
  const processedObjects = [];
  
  for (const tleObj of tleObjects) {
    if (!tleObj.tleLine1 || !tleObj.tleLine2) {
      console.warn(`[Solar Sentinel] Invalid TLE data for ${tleObj.name || 'unknown object'}`);
      continue;
    }
    
    try {
      const satellitePos = propagateSatellite(tleObj, timeOffset);
      
      if (satellitePos) {
        const riskLevel = calculateRiskLevel(
          satellitePos.altitude || 0,
          Infinity,
          satellitePos.velocity || 0
        );
        
        processedObjects.push({
          id: tleObj.id,
          name: tleObj.name,
          x: satellitePos.x,
          y: satellitePos.y,
          riskLevel: riskLevel,
          altitude: satellitePos.altitude,
          velocity: satellitePos.velocity,
          latitude: satellitePos.latitude,
          longitude: satellitePos.longitude,
        });
        
        console.log(`[Solar Sentinel] Processed ${tleObj.name}: pos(${satellitePos.x.toFixed(1)}, ${satellitePos.y.toFixed(1)}), risk:${riskLevel}, altitude:${satellitePos.altitude.toFixed(1)}km`);
        
      } else {
        console.error(`[Solar Sentinel] Failed to propagate ${tleObj.name}`);
      }
      
    } catch (error) {
      console.error(`[Solar Sentinel] Error processing ${tleObj.name}:`, error);
    }
  }
  
  return processedObjects;
}

/**
 * Validate satellite position data
 */
export function validateSatelliteData(satelliteData) {
  return satelliteData &&
         typeof satelliteData.x === 'number' &&
         typeof satelliteData.y === 'number' &&
         typeof satelliteData.riskLevel === 'number' &&
         satelliteData.riskLevel >= 1 &&
         satelliteData.riskLevel <= 10;
}

/**
 * Calculate global threat level based on all satellite risks
 */
export function calculateGlobalThreatLevel(satelliteData) {
  if (!satelliteData || satelliteData.length === 0) {
    return "Low";
  }
  
  const avgRisk = satelliteData.reduce((sum, sat) => sum + sat.riskLevel, 0) / satelliteData.length;
  const maxRisk = Math.max(...satelliteData.map(sat => sat.riskLevel));
  
  if (maxRisk >= 8 || avgRisk >= 6) {
    return "High";
  } else if (maxRisk >= 5 || avgRisk >= 3) {
    return "Medium";
  } else {
    return "Low";
  }
}

/**
 * Get map bounds for visualization
 */
export function getMapBounds(satelliteData) {
  if (!satelliteData || satelliteData.length === 0) {
    return { minX: 0, maxX: MAP_WIDTH, minY: 0, maxY: MAP_HEIGHT };
  }
  
  const xs = satelliteData.map(sat => sat.x);
  const ys = satelliteData.map(sat => sat.y);
  
  return {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, MAP_WIDTH),
    minY: Math.min(...ys, 0),
    maxY: Math.max(...ys, MAP_HEIGHT),
  };
}