/**
 * FlightPrep Solution — Universal In-Flight Dossier & Kneeboard Generator (6-Page Edition)
 * Page 1: Flight Plan, Navlog & Pilot Briefing (Flight Info, Briefing Remarks, IMSAFE, Docs, Navlog)
 * Page 2: Aerodrome Weather Briefing (Selected Airfields METAR & TAF ribbons + raw)
 * Page 3: Visual Route Chart & Aircraft Performance (Vector Minimap, V-Speeds, W&B, Fuel Endurance)
 * Page 4: Aerodrome NOTAMs (Selected Airfields categorized & decoded - directly before Checklists)
 * Page 5: Normal Flight Procedures Checklists (2-column kneeboard format)
 * Page 6: Emergency Procedures, Critical V-Speeds, Transponder Squawks & Light Gun Signals
 */

(function () {
    'use strict';

    // Storage Keys
    const MAP_KEY = 'flightprep_map_data_v11';
    const INFO_KEY = 'flightprep_info_v1';
    const PERF_KEY = 'flightprep_perf_data_v10';
    const CHK_KEY = 'flightprep_checklists_data_v2';
    const WEATHER_KEY = 'flightprep_weather_v1';
    const AIRPORTS_WX_KEY = 'flightprep_airports_wx_v2';
    const NOTAMS_KEY = 'flightprep_notams_v1';

    // Known Airport Coordinates & Names
    const KNOWN_AIRPORTS = {
        'LFPG': { name: 'Paris Charles de Gaulle', lat: 49.0097, lng: 2.5479, alt: 392 },
        'LFPO': { name: 'Paris Orly', lat: 48.7233, lng: 2.3794, alt: 291 },
        'LFPN': { name: 'Toussus-le-Noble', lat: 48.7519, lng: 2.1056, alt: 538 },
        'LFPT': { name: 'Pontoise - Cormeilles', lat: 49.0964, lng: 2.0408, alt: 325 },
        'LFPL': { name: 'Lognes - Emerainville', lat: 48.8219, lng: 2.6236, alt: 354 },
        'LFPM': { name: 'Melun Villaroche', lat: 48.6053, lng: 2.6719, alt: 305 },
        'LFAI': { name: 'Nangis Les Loges', lat: 48.5961, lng: 3.0069, alt: 427 },
        'LFOB': { name: 'Beauvais Tillé', lat: 49.4544, lng: 2.1128, alt: 358 },
        'LFAT': { name: "Le Touquet Côte d'Opale", lat: 50.5147, lng: 1.6214, alt: 36 },
        'LFMD': { name: 'Cannes Mandelieu', lat: 43.5419, lng: 6.9531, alt: 13 },
        'LFMN': { name: "Nice Côte d'Azur", lat: 43.6584, lng: 7.2159, alt: 12 },
        'LFML': { name: 'Marseille Provence', lat: 43.4367, lng: 5.2150, alt: 74 },
        'LFLL': { name: 'Lyon Saint-Exupéry', lat: 45.7256, lng: 5.0811, alt: 821 },
        'LFLY': { name: 'Lyon Bron', lat: 45.7289, lng: 4.9447, alt: 659 },
        'LFBO': { name: 'Toulouse Blagnac', lat: 43.6291, lng: 1.3638, alt: 499 },
        'LFBD': { name: 'Bordeaux Mérignac', lat: 44.8283, lng: -0.7156, alt: 162 },
        'LFRB': { name: 'Brest Bretagne', lat: 48.4478, lng: -4.4225, alt: 325 },
        'LFRN': { name: 'Rennes Saint-Jacques', lat: 48.0694, lng: -1.7347, alt: 124 },
        'EGLL': { name: 'London Heathrow', lat: 51.4700, lng: -0.4543, alt: 83 },
        'EGKK': { name: 'London Gatwick', lat: 51.1537, lng: -0.1821, alt: 202 },
        'EHAM': { name: 'Amsterdam Schiphol', lat: 52.3086, lng: 4.7639, alt: -11 },
        'EBBR': { name: 'Brussels National', lat: 50.9014, lng: 4.4844, alt: 184 },
        'LSGG': { name: 'Geneva Cointrin', lat: 46.2381, lng: 6.1089, alt: 1411 },
        'LSZH': { name: 'Zurich Airport', lat: 47.4647, lng: 8.5492, alt: 1416 }
    };

    // Math Helpers
    function toRad(deg) { return deg * Math.PI / 180; }
    function toDeg(rad) { return rad * 180 / Math.PI; }

    function calculateNavData(lat1, lon1, lat2, lon2) {
        const R = 3440.065; // Earth radius in NM
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = R * c;
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        let bearing = Math.atan2(y, x) * (180 / Math.PI);
        return { dist, course: (bearing + 360) % 360 };
    }

    function calculateLegPerformance(course, dist, tas, windDir, windSpd) {
        const windAngle = toRad(windDir - course);
        const crossWind = Math.sin(windAngle) * windSpd;
        const headWind = Math.cos(windAngle) * windSpd;
        let wca = 0, gs = tas;
        if (tas > Math.abs(crossWind)) {
            wca = toDeg(Math.asin(crossWind / tas));
            gs = Math.sqrt(tas * tas - crossWind * crossWind) - headWind;
        } else {
            gs = 0;
        }
        return { wca, th: (course + wca + 360) % 360, gs, ete: gs > 0 ? (dist / gs) * 60 : 0 };
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Default Emergency Checklists
    const DEFAULT_EMERGENCY_CHECKLISTS = [
        {
            title: "ENGINE FAILURE IN FLIGHT (FORCED LANDING)",
            items: [
                { text: "Airspeed (Best Glide)", value: "ESTABLISH (70 KT)" },
                { text: "Landing Site / Field", value: "SELECT & FLY TOWARDS" },
                { text: "Carburetor Heat", value: "ON" },
                { text: "Fuel Selector Valve", value: "BOTH" },
                { text: "Mixture Control", value: "FULL RICH" },
                { text: "Aux Fuel Pump", value: "ON (IF EQUIPPED)" },
                { text: "Ignition Switch", value: "BOTH (OR START)" },
                { text: "IF NO RESTART POSSIBLE:", value: "PREPARE TOUCHDOWN" },
                { text: "Transponder / Squawk", value: "7700" },
                { text: "Radio Mayday (121.5 MHz)", value: "TRANSMIT" },
                { text: "Mixture Control", value: "IDLE CUT-OFF" },
                { text: "Fuel Shutoff Valve", value: "OFF" },
                { text: "Ignition Switch", value: "OFF" },
                { text: "Wing Flaps", value: "AS REQUIRED" },
                { text: "Master Switch", value: "OFF BEFORE IMPACT" }
            ]
        },
        {
            title: "ENGINE FIRE IN FLIGHT",
            items: [
                { text: "Mixture Control", value: "IDLE CUT-OFF" },
                { text: "Fuel Shutoff Valve", value: "OFF" },
                { text: "Master Switch", value: "OFF" },
                { text: "Cabin Heat & Air", value: "OFF" },
                { text: "Airspeed", value: "INCREASE TO EXTINGUISH" },
                { text: "Forced Landing", value: "EXECUTE IMMEDIATELY" }
            ]
        },
        {
            title: "ELECTRICAL FIRE IN FLIGHT",
            items: [
                { text: "Master Switch", value: "OFF" },
                { text: "Avionics Power", value: "OFF" },
                { text: "All Other Switches", value: "OFF" },
                { text: "Cabin Vents", value: "OPEN (CLEAR SMOKE)" },
                { text: "Fire Extinguisher", value: "ACTIVATE IF REQ" },
                { text: "Flight", value: "LAND AS SOON AS PRACTICAL" }
            ]
        }
    ];

    // Default Normal Checklists
    const DEFAULT_NORMAL_CHECKLISTS = [
        {
            title: "Pre-Flight & Cockpit",
            items: [
                { text: "Aircraft Documents (AROW)", value: "ON BOARD" },
                { text: "Control Lock", value: "REMOVED" },
                { text: "Ignition Switch", value: "OFF / KEYS ON DASH" },
                { text: "Master Switch", value: "ON" },
                { text: "Fuel Quantity Gauges", value: "CHECKED" },
                { text: "Flaps", value: "EXTEND FULL" },
                { text: "Master Switch", value: "OFF" }
            ]
        },
        {
            title: "Engine Start & Taxi",
            items: [
                { text: "Pre-Flight Inspection", value: "COMPLETE" },
                { text: "Passenger Briefing", value: "ACCOMPLISHED" },
                { text: "Seatbelts & Harnesses", value: "FASTENED" },
                { text: "Brakes", value: "TEST & HOLD" },
                { text: "Circuit Breakers", value: "CHECK IN" },
                { text: "Beacon / Anti-Collision", value: "ON" },
                { text: "Propeller Area", value: "CLEAR" },
                { text: "Starter", value: "ENGAGE" },
                { text: "Oil Pressure (30s)", value: "CHECK GREEN" }
            ]
        },
        {
            title: "Before Takeoff (Run-Up)",
            items: [
                { text: "Parking Brake", value: "SET" },
                { text: "Flight Controls", value: "FREE & CORRECT" },
                { text: "Flight Instruments", value: "SET & CHECK" },
                { text: "Fuel Selector", value: "BOTH" },
                { text: "Elevator Trim", value: "SET TAKEOFF" },
                { text: "Throttle", value: "1700 - 1800 RPM" },
                { text: "Magnetos Check", value: "MAX 150 DROP / 50 DIFF" },
                { text: "Carburetor Heat", value: "CHECK DROP & CLEAR" },
                { text: "Engine Gauges & Ammeter", value: "CHECK GREEN" },
                { text: "Throttle", value: "IDLE CHECK (600-800 RPM)" },
                { text: "Flaps", value: "SET FOR TAKEOFF (0°-10°)" },
                { text: "Cabin Doors & Windows", value: "LATCHED" }
            ]
        },
        {
            title: "Cruise & Descent",
            items: [
                { text: "Power (Cruise RPM)", value: "SET PER POH" },
                { text: "Elevator Trim", value: "ADJUSTED" },
                { text: "Mixture", value: "LEANED (>3000FT)" },
                { text: "Engine Gauges", value: "MONITOR GREEN" },
                { text: "Altimeter Setting (QNH)", value: "UPDATE CURRENT" },
                { text: "Fuel Selector / Balance", value: "CHECKED" },
                { text: "Destination ATIS / WX", value: "OBTAINED" },
                { text: "Approach Briefing", value: "COMPLETED" }
            ]
        },
        {
            title: "Before Landing & After Landing",
            items: [
                { text: "Seatbelts & Harnesses", value: "SECURE" },
                { text: "Fuel Selector", value: "BOTH" },
                { text: "Mixture", value: "FULL RICH" },
                { text: "Carburetor Heat", value: "ON AS REQUIRED" },
                { text: "Landing Light", value: "ON" },
                { text: "Wing Flaps", value: "AS DESIRED (< Vfe)" },
                { text: "Runway Exit & Stop", value: "CLEAR OF RWY" },
                { text: "Flaps", value: "RETRACT FULL" },
                { text: "Carb Heat", value: "COLD / OFF" },
                { text: "Transponder", value: "ALT / AS REQ" }
            ]
        }
    ];

    // ==========================================
    // VECTOR MINIMAP GENERATOR (SVG) - FIXED
    // ==========================================
    function generateRouteMinimapSVG(waypoints) {
        const svgW = 720;
        const svgH = 320;

        if (!Array.isArray(waypoints) || waypoints.length === 0) {
            return `
                <div style="width: 100%; height: ${svgH}px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #faf8f5; border: 1.5px dashed #bbb; border-radius: 4px; color: #777; font-size: 13px; text-align: center; padding: 20px; box-sizing: border-box;">
                    <div style="font-size: 28px; margin-bottom: 8px;">🗺️</div>
                    <strong style="color: #333; margin-bottom: 4px;">No Flight Track Plotted</strong>
                    <span>Add waypoints in the Interactive Route Map or Flight Preparation page to render your visual flight chart.</span>
                </div>
            `;
        }

        const validWps = waypoints
            .map(wp => ({
                name: String(wp.name || 'WPT'),
                lat: parseFloat(wp.lat),
                lng: parseFloat(wp.lng),
                alt: wp.alt !== undefined ? wp.alt : 3500
            }))
            .filter(wp => !isNaN(wp.lat) && !isNaN(wp.lng));

        if (validWps.length === 0) {
            return `
                <div style="width: 100%; height: ${svgH}px; display: flex; align-items: center; justify-content: center; background: #faf8f5; border: 1.5px dashed #bbb; border-radius: 4px; color: #777; font-size: 13px;">
                    Invalid waypoint coordinates provided.
                </div>
            `;
        }

        if (validWps.length === 1) {
            const wp = validWps[0];
            return `
                <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; background:#faf8f5; border:1.5px solid #000; border-radius:4px; font-family:'Inter', Arial, sans-serif;">
                    <circle cx="${svgW / 2}" cy="${svgH / 2}" r="60" fill="none" stroke="#ddd" stroke-width="1" stroke-dasharray="4,4" />
                    <circle cx="${svgW / 2}" cy="${svgH / 2}" r="30" fill="none" stroke="#ccc" stroke-width="1" />
                    <circle cx="${svgW / 2}" cy="${svgH / 2}" r="8" fill="#188038" stroke="#fff" stroke-width="2" />
                    <text x="${svgW / 2}" y="${svgH / 2 - 18}" font-size="12" font-weight="800" fill="#111" text-anchor="middle">${escapeHtml(wp.name)}</text>
                    <text x="${svgW / 2}" y="${svgH / 2 + 25}" font-size="10" font-family="monospace" fill="#555" text-anchor="middle">${wp.lat.toFixed(4)}° / ${wp.lng.toFixed(4)}° &bull; ${wp.alt}ft</text>
                    <text x="14" y="22" font-size="10" font-weight="700" fill="#666">SINGLE WAYPOINT &bull; ADD DESTINATION FOR TRACK</text>
                </svg>
            `;
        }

        // Bounding box calculation
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        validWps.forEach(wp => {
            if (wp.lat < minLat) minLat = wp.lat;
            if (wp.lat > maxLat) maxLat = wp.lat;
            if (wp.lng < minLng) minLng = wp.lng;
            if (wp.lng > maxLng) maxLng = wp.lng;
        });

        let dLat = maxLat - minLat;
        let dLng = maxLng - minLng;
        if (dLat < 0.05) dLat = 0.05;
        if (dLng < 0.05) dLng = 0.05;

        // Apply 18% padding
        const padLat = dLat * 0.20;
        const padLng = dLng * 0.20;
        minLat -= padLat; maxLat += padLat;
        minLng -= padLng; maxLng += padLng;

        const avgLat = (minLat + maxLat) / 2;
        const cosLat = Math.cos(toRad(avgLat));

        const marginX = 55;
        const marginY = 40;
        const plotW = svgW - marginX * 2;
        const plotH = svgH - marginY * 2;

        const normX = lng => marginX + ((lng - minLng) / (maxLng - minLng)) * plotW;
        const normY = lat => marginY + ((maxLat - lat) / (maxLat - minLat)) * plotH;

        const points = validWps.map(wp => ({
            x: normX(wp.lng),
            y: normY(wp.lat),
            name: wp.name,
            alt: wp.alt,
            lat: wp.lat,
            lng: wp.lng
        }));

        const polylinePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

        // Calculate distances & leg midpoints
        let totalDistNm = 0;
        const legTags = [];
        for (let i = 0; i < validWps.length - 1; i++) {
            const nav = calculateNavData(validWps[i].lat, validWps[i].lng, validWps[i + 1].lat, validWps[i + 1].lng);
            totalDistNm += nav.dist;
            const midX = (points[i].x + points[i + 1].x) / 2;
            const midY = (points[i].y + points[i + 1].y) / 2;
            legTags.push({
                x: midX,
                y: midY,
                text: `${Math.round(nav.course).toString().padStart(3, '0')}° / ${nav.dist.toFixed(1)}nm`
            });
        }

        // Scale bar calculation
        let scaleNm = 20;
        if (totalDistNm < 25) scaleNm = 5;
        else if (totalDistNm < 50) scaleNm = 10;
        else if (totalDistNm > 150) scaleNm = 50;

        const totalDegLng = maxLng - minLng;
        const nmPerDegLng = 60 * (cosLat || 1);
        const totalPlotNm = totalDegLng * nmPerDegLng;
        const scaleBarPx = Math.max(35, Math.min(180, (scaleNm / (totalPlotNm || 1)) * plotW));

        // Background subtle grid lines
        const gridLines = [];
        for (let i = 1; i <= 3; i++) {
            const y = marginY + (plotH / 4) * i;
            gridLines.push(`<line x1="10" y1="${y.toFixed(1)}" x2="${svgW - 10}" y2="${y.toFixed(1)}" stroke="#ece8df" stroke-width="1" stroke-dasharray="4,4" />`);
        }
        for (let i = 1; i <= 4; i++) {
            const x = marginX + (plotW / 5) * i;
            gridLines.push(`<line x1="${x.toFixed(1)}" y1="10" x2="${x.toFixed(1)}" y2="${svgH - 10}" stroke="#ece8df" stroke-width="1" stroke-dasharray="4,4" />`);
        }

        return `
            <div style="width: 100%; height: ${svgH}px; position: relative; background: #faf8f5; border: 1.5px solid #000; border-radius: 4px; overflow: hidden; box-sizing: border-box;">
                <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; width:100%; height:100%; font-family:'Inter', -apple-system, sans-serif;">
                    <!-- Grid Lines -->
                    ${gridLines.join('')}

                    <!-- Flight Track Casing & Centerline -->
                    <polyline points="${polylinePoints}" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
                    <polyline points="${polylinePoints}" fill="none" stroke="#111111" stroke-width="2.5" stroke-dasharray="8,4" stroke-linecap="round" stroke-linejoin="round" />

                    <!-- Leg Distance & Course Badges -->
                    ${legTags.map(tag => `
                        <g transform="translate(${tag.x.toFixed(1)}, ${tag.y.toFixed(1)})">
                            <rect x="-44" y="-10" width="88" height="20" rx="3" fill="#ffffff" stroke="#111111" stroke-width="1.2" />
                            <text x="0" y="4" font-size="9.5" font-weight="800" fill="#111111" text-anchor="middle">${escapeHtml(tag.text)}</text>
                        </g>
                    `).join('')}

                    <!-- Waypoint Pins & Labels -->
                    ${points.map((p, idx) => {
                        const isStart = idx === 0;
                        const isEnd = idx === points.length - 1;
                        const pinColor = isStart ? '#188038' : (isEnd ? '#c5221f' : '#1967d2');
                        const labelBg = isStart ? '#e6f4ea' : (isEnd ? '#fce8e6' : '#ffffff');
                        const yOffset = idx % 2 === 0 ? -18 : 22;

                        return `
                            <g>
                                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="#ffffff" stroke="${pinColor}" stroke-width="3" />
                                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="${pinColor}" />

                                <g transform="translate(${p.x.toFixed(1)}, ${(p.y + yOffset).toFixed(1)})">
                                    <rect x="-42" y="-10" width="84" height="20" rx="3" fill="${labelBg}" stroke="#111111" stroke-width="1" />
                                    <text x="0" y="4" font-size="10.5" font-weight="800" fill="#111111" text-anchor="middle">${escapeHtml(p.name)}</text>
                                </g>
                                <text x="${p.x.toFixed(1)}" y="${(p.y + yOffset + (idx % 2 === 0 ? -12 : 26)).toFixed(1)}" font-size="8.5" font-family="monospace" font-weight="700" fill="#444" text-anchor="middle">${p.alt}ft</text>
                            </g>
                        `;
                    }).join('')}

                    <!-- North Arrow -->
                    <g transform="translate(${svgW - 36}, 34)">
                        <circle cx="0" cy="0" r="16" fill="#ffffff" stroke="#111111" stroke-width="1.5" />
                        <polygon points="0,-12 -4,0 4,0" fill="#111111" />
                        <polygon points="0,12 -4,0 4,0" fill="#bbbbbb" />
                        <text x="0" y="-15" font-size="9" font-weight="900" fill="#111111" text-anchor="middle">N</text>
                    </g>

                    <!-- Scale Bar -->
                    <g transform="translate(20, ${svgH - 22})">
                        <rect x="-4" y="-12" width="${scaleBarPx + 64}" height="22" rx="3" fill="#ffffff" stroke="#999999" stroke-width="0.8" />
                        <line x1="0" y1="0" x2="${scaleBarPx}" y2="0" stroke="#111111" stroke-width="3" />
                        <line x1="0" y1="-4" x2="0" y2="4" stroke="#111111" stroke-width="2" />
                        <line x1="${scaleBarPx}" y1="-4" x2="${scaleBarPx}" y2="4" stroke="#111111" stroke-width="2" />
                        <text x="${scaleBarPx + 8}" y="3.5" font-size="9.5" font-weight="800" fill="#111111">${scaleNm} NM</text>
                    </g>

                    <!-- Header Watermark -->
                    <text x="14" y="20" font-size="10" font-weight="800" letter-spacing="0.5" fill="#555555">
                        VFR ROUTE PLOT &bull; TOTAL DIST: ${totalDistNm.toFixed(1)} NM &bull; ${validWps.length - 1} LEGS
                    </text>
                </svg>
            </div>
        `;
    }

    // ==========================================
    // BUILD COMPLETE 6-PAGE IN-FLIGHT DOSSIER
    // ==========================================
    function buildDossierHtml() {
        // Load data from all storage sources
        const info = JSON.parse(localStorage.getItem(INFO_KEY) || '{}');
        const mapData = JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
        const perfData = JSON.parse(localStorage.getItem(PERF_KEY) || '{}');
        const chkData = JSON.parse(localStorage.getItem(CHK_KEY) || '{}');
        const weatherData = JSON.parse(localStorage.getItem(WEATHER_KEY) || '{}');
        const airportsWx = JSON.parse(localStorage.getItem(AIRPORTS_WX_KEY) || '[]');
        const notamsData = JSON.parse(localStorage.getItem(NOTAMS_KEY) || '[]');

        const waypoints = Array.isArray(mapData.waypoints) ? mapData.waypoints : [];
        const tas = parseFloat(mapData.tas) || 110;
        const windDir = parseFloat(mapData.windDir) || 0;
        const windSpd = parseFloat(mapData.windSpd) || 0;

        const flightNumber = info.flightNumber || 'N/A';
        const aircraft = info.aircraft || 'Cessna 172';
        const dateStr = info.date || new Date().toISOString().split('T')[0];
        const departureTime = info.departureTime || info.time || info.hour || '';
        const pic = info.pic || 'Pilot in Command';
        const pob = info.pob || '1';
        const notes = info.notes || '';
        const readiness = info.readiness || {};
        const imsafe = readiness.imsafe || {};
        const docs = readiness.documents || {};

        const totalPages = 6;
        const nowFormatted = new Date().toUTCString().replace('GMT', 'UTC');

        // Reusable Standard Header for All 6 Pages
        const pageHeader = (title, pageNum) => `
            <div style="border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">FlightPrep Kneeboard</span>
                        <span style="font-size: 10px; background: #000; color: #fff; padding: 2px 6px; font-weight: 700; border-radius: 3px; letter-spacing: 0.5px;">IN-FLIGHT DOSSIER</span>
                    </div>
                    <h1 style="font-size: 18px; font-weight: 800; margin: 3px 0 0 0; text-transform: uppercase;">${escapeHtml(title)}</h1>
                </div>
                <div style="text-align: right; font-size: 11px; line-height: 1.4;">
                    <div>Callsign: <strong>${escapeHtml(flightNumber)}</strong> &nbsp;|&nbsp; Acft: <strong>${escapeHtml(aircraft)}</strong></div>
                    <div>Date: <strong>${escapeHtml(dateStr)}${departureTime ? ' @ ' + escapeHtml(departureTime) + 'Z' : ''}</strong> &nbsp;|&nbsp; Page <strong>${pageNum} / ${totalPages}</strong></div>
                </div>
            </div>
        `;

        // ---------------------------------------------------------
        // 1. PAGE 1: NAVLOG CALCULATIONS & PILOT BRIEF
        // ---------------------------------------------------------
        let navRowsHtml = '';
        let totDist = 0;
        let totTimeMin = 0;

        for (let i = 0; i < waypoints.length - 1; i++) {
            const w1 = waypoints[i];
            const w2 = waypoints[i + 1];
            const lat1 = parseFloat(w1.lat); const lon1 = parseFloat(w1.lng);
            const lat2 = parseFloat(w2.lat); const lon2 = parseFloat(w2.lng);

            if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) continue;

            const geo = calculateNavData(lat1, lon1, lat2, lon2);
            const perf = calculateLegPerformance(geo.course, geo.dist, tas, windDir, windSpd);

            totDist += geo.dist;
            totTimeMin += perf.ete;

            const alt = w1.alt !== undefined ? w1.alt : 3500;
            const bg = i % 2 === 0 ? '#ffffff' : '#f9f8f6';

            navRowsHtml += `
                <tr style="background: ${bg};">
                    <td style="padding: 6px 8px; border-bottom: 1px solid #ccc; font-weight: 700; font-size: 11px;">
                        ${escapeHtml(w1.name)} ➔ ${escapeHtml(w2.name)}
                    </td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 10.5px; font-family: monospace;">${alt}</td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 10.5px;">${Math.round(geo.course).toString().padStart(3, '0')}°</td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 10.5px; font-weight: 600;">${geo.dist.toFixed(1)}</td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 11px; font-weight: 700;">${Math.round(perf.th).toString().padStart(3, '0')}°</td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 10.5px; font-family: monospace;">${Math.round(perf.gs)}</td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 11px; font-weight: 700;">${Math.round(perf.ete)}m</td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 10px; color: #777;">____</td>
                    <td style="padding: 6px 6px; border-bottom: 1px solid #ccc; text-align: center; font-size: 10px; color: #777;">____</td>
                </tr>
            `;
        }

        if (waypoints.length < 2) {
            navRowsHtml = `
                <tr>
                    <td colspan="9" style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
                        No route legs plotted yet. Add waypoints in the Interactive Route Map or Flight Preparation page.
                    </td>
                </tr>
            `;
        }

        const hrs = Math.floor(totTimeMin / 60);
        const mins = Math.round(totTimeMin % 60);
        const totTimeStr = `${hrs > 0 ? hrs + 'h ' : ''}${mins}m`;

        // IMSAFE checks display items
        const imsafeItems = [
            { key: 'illness', label: 'Illness', desc: 'No symptoms affecting fitness', val: imsafe.illness || readiness.chk_imsafe_illness },
            { key: 'medication', label: 'Medication', desc: 'No unapproved meds taken', val: imsafe.medication || readiness.chk_imsafe_medication },
            { key: 'stress', label: 'Stress', desc: 'Psychologically calm & focused', val: imsafe.stress || readiness.chk_imsafe_stress },
            { key: 'alcohol', label: 'Alcohol', desc: '0.00% BAC / > 8h compliant', val: imsafe.alcohol || readiness.chk_imsafe_alcohol },
            { key: 'fatigue', label: 'Fatigue', desc: 'Well rested & alert', val: imsafe.fatigue || readiness.chk_imsafe_fatigue },
            { key: 'emotion', label: 'Emotion', desc: 'Emotionally stable', val: imsafe.emotion || readiness.chk_imsafe_emotion }
        ];

        // Document verification display items
        const docItems = [
            { key: 'license', label: 'Pilot License & Ratings', val: docs.license || readiness.chk_doc_license },
            { key: 'medical', label: 'Valid Medical Certificate', val: docs.medical || readiness.chk_doc_medical },
            { key: 'arow', label: 'Aircraft A.R.O.W. Docs', val: docs.arow || readiness.chk_doc_arow },
            { key: 'charts', label: 'Current VFR Charts & Navlog', val: docs.charts || readiness.chk_doc_charts }
        ];

        // ---------------------------------------------------------
        // 2. PAGE 2: AERODROME WEATHER (METAR & TAF)
        // ---------------------------------------------------------
        let weatherCardsHtml = '';
        const monitoredApts = Array.isArray(airportsWx) ? airportsWx : [];

        if (monitoredApts.length === 0) {
            weatherCardsHtml = `
                <div style="padding: 25px; text-align: center; border: 1px dashed #999; background: #fafafa; border-radius: 4px; color: #555; font-size: 12px; margin-bottom: 16px;">
                    <div style="font-size: 24px; margin-bottom: 6px;">🌤️</div>
                    <strong>No Monitored Airfields in Weather Table</strong>
                    <div style="margin-top: 4px; color: #777;">
                        Enter airport ICAO codes in the Flight Preparation page to populate live METAR and TAF reports for departure, destination, and alternates.
                    </div>
                </div>
            `;
        } else {
            weatherCardsHtml = monitoredApts.map(apt => {
                const dec = apt.decoded || {};
                const fltCat = apt.flightCategory || 'VFR';

                let catBg = '#e6f4ea', catColor = '#188038';
                if (fltCat === 'MVFR') { catBg = '#e8f0fe'; catColor = '#1967d2'; }
                else if (fltCat === 'IFR') { catBg = '#fce8e6'; catColor = '#c5221f'; }
                else if (fltCat === 'LIFR') { catBg = '#f3e8fd'; catColor = '#8e24aa'; }

                const windStr = dec.wdir !== undefined ? `${dec.wdir}° / ${dec.wspd} kt${dec.wgst ? ' G' + dec.wgst + 'kt' : ''}` : 'Wind: —';
                const visStr = dec.vis || (dec.isCavok ? 'CAVOK' : 'Vis: —');
                const cloudsStr = dec.clouds && dec.clouds.length > 0
                    ? dec.clouds.map(c => `${c.cover}${Math.round(c.base / 100).toString().padStart(3, '0')}`).join(' ')
                    : (dec.isCavok ? 'Nil clouds' : 'Clouds: —');
                const tempStr = dec.temp !== undefined ? `${dec.temp}°C / ${dec.dewp !== undefined ? dec.dewp + '°C' : ''}` : '—';
                const altimStr = dec.qnh ? `QNH ${dec.qnh} hPa` : '—';

                return `
                    <div style="border: 1.5px solid #000; border-radius: 4px; background: #fff; margin-bottom: 14px; overflow: hidden; page-break-inside: avoid;">
                        <!-- Airport Title Bar -->
                        <div style="background: #f1efe9; padding: 6px 12px; border-bottom: 1px solid #000; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 14px; font-weight: 900; font-family: monospace; letter-spacing: 0.5px;">${escapeHtml(apt.icao)}</span>
                                <span style="font-size: 12px; font-weight: 700; color: #222;">${escapeHtml(apt.name || (KNOWN_AIRPORTS[apt.icao] && KNOWN_AIRPORTS[apt.icao].name) || '')}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 3px; background: ${catBg}; color: ${catColor}; border: 1px solid ${catColor};">
                                    ${escapeHtml(fltCat)}
                                </span>
                                <span style="font-size: 10px; color: #666;">${escapeHtml(apt.updatedAt ? 'Obs: ' + apt.updatedAt : '')}</span>
                            </div>
                        </div>

                        <!-- Decoded Weather Parameter Ribbon -->
                        <div style="display: grid; grid-template-columns: repeat(5, 1fr); background: #fafafa; border-bottom: 1px solid #e0e0e0; font-size: 11px; text-align: center; padding: 6px 4px;">
                            <div style="border-right: 1px solid #e0e0e0; padding: 2px 4px;">
                                <span style="font-size: 9px; text-transform: uppercase; color: #666; font-weight: 700;">Wind</span>
                                <div style="font-weight: 800; margin-top: 1px;">${escapeHtml(windStr)}</div>
                            </div>
                            <div style="border-right: 1px solid #e0e0e0; padding: 2px 4px;">
                                <span style="font-size: 9px; text-transform: uppercase; color: #666; font-weight: 700;">Visibility</span>
                                <div style="font-weight: 800; margin-top: 1px;">${escapeHtml(visStr)}</div>
                            </div>
                            <div style="border-right: 1px solid #e0e0e0; padding: 2px 4px;">
                                <span style="font-size: 9px; text-transform: uppercase; color: #666; font-weight: 700;">Ceiling / Sky</span>
                                <div style="font-weight: 800; margin-top: 1px;">${escapeHtml(cloudsStr)}</div>
                            </div>
                            <div style="border-right: 1px solid #e0e0e0; padding: 2px 4px;">
                                <span style="font-size: 9px; text-transform: uppercase; color: #666; font-weight: 700;">Temp / Dewp</span>
                                <div style="font-weight: 800; margin-top: 1px;">${escapeHtml(tempStr)}</div>
                            </div>
                            <div style="padding: 2px 4px;">
                                <span style="font-size: 9px; text-transform: uppercase; color: #666; font-weight: 700;">Altimeter</span>
                                <div style="font-weight: 800; margin-top: 1px;">${escapeHtml(altimStr)}</div>
                            </div>
                        </div>

                        <!-- Raw METAR & TAF Content -->
                        <div style="padding: 8px 12px; font-size: 10.5px; line-height: 1.45;">
                            <div style="margin-bottom: 6px;">
                                <span style="font-weight: 800; font-size: 10px; text-transform: uppercase; color: #188038;">[METAR]</span>
                                <span style="font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-weight: 600;">${escapeHtml(apt.metar || 'No METAR issued.')}</span>
                            </div>
                            ${apt.taf ? `
                                <div style="border-top: 1px dashed #ddd; padding-top: 6px; margin-top: 4px;">
                                    <span style="font-weight: 800; font-size: 10px; text-transform: uppercase; color: #1967d2;">[TAF]</span>
                                    <span style="font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 10px; color: #222; white-space: pre-wrap;">${escapeHtml(apt.taf)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ---------------------------------------------------------
        // 3. PAGE 3: MINIMAP & AIRCRAFT PERFORMANCE
        // ---------------------------------------------------------
        const minimapSvg = generateRouteMinimapSVG(waypoints);

        const speeds = Array.isArray(perfData.speeds) ? perfData.speeds : [
            { name: 'Vx', value: 62, unit: 'kt', desc: 'Best angle of climb', type: 'normal' },
            { name: 'Vy', value: 74, unit: 'kt', desc: 'Best rate of climb', type: 'normal' },
            { name: 'Vfe', value: 85, unit: 'kt', desc: 'Max flap extended speed', type: 'normal' },
            { name: 'Va', value: 105, unit: 'kt', desc: 'Maneuvering speed', type: 'normal' },
            { name: 'Vno', value: 129, unit: 'kt', desc: 'Max structural cruising speed', type: 'normal' },
            { name: 'Best Glide', value: 70, unit: 'kt', desc: 'Best glide speed', type: 'emergency' },
            { name: 'Vs0', value: 40, unit: 'kt', desc: 'Stall speed, landing config', type: 'emergency' },
            { name: 'Vs1', value: 47, unit: 'kt', desc: 'Stall speed, clean config', type: 'emergency' },
            { name: 'Vne', value: 163, unit: 'kt', desc: 'Never exceed speed', type: 'emergency' }
        ];

        const normalSpeeds = speeds.filter(s => s.type === 'normal');
        const emergencySpeeds = speeds.filter(s => s.type === 'emergency');

        // Weight & Balance Summary
        const wbRows = Array.isArray(perfData.wbRows) ? perfData.wbRows : [];
        let tw = 0, tm = 0;
        wbRows.forEach(r => {
            const w = parseFloat(r.weight) || 0;
            const a = parseFloat(r.arm) || 0;
            tw += w; tm += w * a;
        });
        const calcCg = tw > 0 ? (tm / tw).toFixed(1) : '—';
        const mtow = perfData.profile?.mtow || 1150;
        const uW = perfData.units?.weight || 'kg';
        const uA = perfData.units?.arm || 'cm';
        const margin = mtow - tw;

        // Fuel & Endurance
        const fuelCap = perfData.fuelCapacity || 150;
        const fuelBurn = perfData.fuelFlow || 35;
        const uF = perfData.units?.fuel || 'L';
        const maxEnduranceHours = fuelBurn > 0 ? (fuelCap / fuelBurn).toFixed(1) : '—';

        // ---------------------------------------------------------
        // 4. PAGE 4: AERODROME NOTAMS (SELECTED AIRFIELDS)
        // ---------------------------------------------------------
        let notamsHtml = '';
        const rawNotamsList = Array.isArray(notamsData) ? notamsData : [];

        // Filter out any mock NOTAM signatures from legacy versions
        const MOCK_SIGNATURES = [
            'RWY 08R/26L CLSD DUE TO WORK IN PROGRESS',
            'GRASS RWY 07L/25R CLSD DUE TO WATER ACCUMULATION',
            'VOR CLM 113.85 MHZ U/S',
            'OBST CRANE ERECTED 1.2NM EAST OF THR 27R',
            'BIRD HAZARD CONCENTRATED IN VICINITY OF RWY 09L/27R',
            'TWR HOURS OF OPS: MON-FRI 0700-1900 UTC',
            'PARACHUTING ACTIVITY OVER SECTOR NORTH',
            'ILS DME RWY 27L NOT AVBL DUE TO SCHEDULED CALIBRATION',
            'TWY B BTN TWY B2 AND TWY B4 CLSD',
            'STANDARD NOISE ABATEMENT PROCEDURES IN EFFECT',
            'OBSTACLE CRANE ERECTED IN VICINITY OF AERODROME',
            'MAINT VEHICLES ON SFC'
        ];

        const monitoredNotamsList = rawNotamsList.map(apt => {
            const cleanList = (Array.isArray(apt.notams) ? apt.notams : []).filter(n => {
                const full = ((n.text || '') + ' ' + (n.raw || '')).toUpperCase();
                return !MOCK_SIGNATURES.some(sig => full.includes(sig.toUpperCase()));
            }).map(n => {
                if (n.raw) {
                    if (!n.lowerLimit && !n.upperLimit) {
                        const fMatch = n.raw.match(/F\)\s*([^\n\r]+?)(?=(?:\s+G\)|$))/i);
                        if (fMatch) n.lowerLimit = fMatch[1].trim();
                        const gMatch = n.raw.match(/G\)\s*([^\n\r]+)/i);
                        if (gMatch) n.upperLimit = gMatch[1].trim();
                        if (!n.lowerLimit && !n.upperLimit) {
                            const flMatch = n.raw.match(/\/(\d{3})\/(\d{3})\//);
                            if (flMatch && (flMatch[1] !== '000' || flMatch[2] !== '999')) {
                                n.lowerLimit = flMatch[1] === '000' ? 'SFC' : `FL${flMatch[1]}`;
                                n.upperLimit = flMatch[2] === '999' ? 'UNL' : `FL${flMatch[2]}`;
                            }
                        }
                    }
                    if (!n.schedule) {
                        const dMatch = n.raw.match(/D\)\s*([^\n\r]+)/i);
                        if (dMatch) n.schedule = dMatch[1].trim();
                    }
                    if (!n.coordinates) {
                        const coordMatch = n.raw.match(/(\d{4}[NS])\s*(\d{5}[EW])(?:\s*(\d{3}))?/);
                        if (coordMatch) {
                            n.coordinates = `${coordMatch[1]} ${coordMatch[2]}`;
                            if (coordMatch[3] && !n.radius) {
                                const r = parseInt(coordMatch[3], 10);
                                if (r > 0) n.radius = `${r} NM`;
                            }
                        }
                    }
                }
                return n;
            });
            return { ...apt, notams: cleanList };
        });

        const formatDossierNotamDate = (dVal) => {
            if (!dVal) return 'ACTIVE';
            if (dVal === 'PERM') return 'PERM';
            const d = new Date(dVal);
            if (isNaN(d.getTime())) return String(dVal);
            const day = d.getUTCDate().toString().padStart(2, '0');
            const mo = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
            const hh = d.getUTCHours().toString().padStart(2, '0');
            const mm = d.getUTCMinutes().toString().padStart(2, '0');
            return `${day} ${mo} ${hh}:${mm}Z`;
        };

        if (monitoredNotamsList.length === 0) {
            notamsHtml = `
                <div style="padding: 30px; text-align: center; border: 1px dashed #999; background: #fafafa; border-radius: 4px; color: #555; font-size: 12px;">
                    <div style="font-size: 28px; margin-bottom: 8px;">📋</div>
                    <strong style="font-size: 14px; color: #222;">No Aerodromes Monitored for this Flight</strong>
                    <div style="margin-top: 6px; color: #666; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                        To include operational NOTAMs in this section, add aerodrome ICAO codes or click "Route Airfields" in the NOTAMs module on the Flight Preparation page.
                    </div>
                </div>
            `;
        } else {
            notamsHtml = monitoredNotamsList.map(apt => {
                const notamList = Array.isArray(apt.notams) ? apt.notams : [];
                return `
                    <div style="border: 1.5px solid #000; border-radius: 4px; background: #fff; margin-bottom: 14px; overflow: hidden; page-break-inside: avoid;">
                        <!-- Aerodrome Header -->
                        <div style="background: #f1efe9; padding: 6px 12px; border-bottom: 1px solid #000; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <strong style="font-size: 13px; font-family: monospace;">${escapeHtml(apt.icao)}</strong>
                                <span style="font-size: 12px; font-weight: 700; color: #222;">${escapeHtml(apt.name || (typeof KNOWN_AIRPORTS !== 'undefined' && KNOWN_AIRPORTS[apt.icao] && KNOWN_AIRPORTS[apt.icao].name) || 'Aerodrome')}</span>
                            </div>
                            <span style="font-size: 11px; font-weight: 700; color: #555;">${notamList.length} Active NOTAM${notamList.length === 1 ? '' : 's'}${apt.source ? ` • <span style="font-size: 9.5px; color: #1a73e8; font-weight: 800;">${escapeHtml(apt.source)}</span>` : ''}</span>
                        </div>

                        <!-- NOTAMs List -->
                        <div style="padding: 8px 12px;">
                            ${notamList.length === 0 ? `
                                ${apt.imported ? `
                                    <div style="padding: 10px; color: #188038; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                                        <span>✓</span> 0 active operational NOTAMs on record for this aerodrome.
                                    </div>
                                ` : `
                                    <div style="padding: 10px; color: #b06000; background: #fffdf5; border: 1px dashed #e0a800; border-radius: 3px; font-size: 11px; display: flex; align-items: center; gap: 8px;">
                                        <span>⚠️</span> <strong>Pending Briefing Import:</strong> No NOTAMs recorded for ${escapeHtml(apt.icao)}. Verify official national AIS / PIB before flight.
                                    </div>
                                `}
                            ` : notamList.map(n => {
                                const sev = n.severity || 'info';
                                let sevBg = '#f0f0f0', sevCol = '#333';
                                if (sev === 'critical') { sevBg = '#fce8e6'; sevCol = '#c5221f'; }
                                else if (sev === 'warning') { sevBg = '#fef7e0'; sevCol = '#b06000'; }

                                const catLabel = (n.cat || 'GENERAL').toUpperCase();
                                const fromDateStr = formatDossierNotamDate(n.startDate);
                                const toDateStr = n.isPerm ? 'PERM' : formatDossierNotamDate(n.endDate);

                                const vertLimits = (n.lowerLimit || n.upperLimit) ? `${n.lowerLimit || 'SFC'} ➔ ${n.upperLimit || 'UNL'}` : '';
                                const locInfo = (n.coordinates || n.radius) ? `${n.coordinates || ''}${n.radius ? ` (${n.radius})` : ''}` : '';

                                return `
                                    <div style="border-bottom: 1px solid #eee; padding: 7px 0; font-size: 11px; line-height: 1.4;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                                            <div style="display: flex; align-items: center; gap: 6px;">
                                                <strong style="font-family: monospace; font-size: 11px;">${escapeHtml(n.id || 'NOTAM')}</strong>
                                                <span style="font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 2px; background: ${sevBg}; color: ${sevCol}; border: 1px solid ${sevCol};">
                                                    ${escapeHtml(catLabel)}
                                                </span>
                                                ${n.title ? `<span style="font-weight: 700; color: #222; font-size: 10.5px;">${escapeHtml(n.title)}</span>` : ''}
                                            </div>
                                            <div style="font-size: 9.5px; color: #666; font-family: monospace;">
                                                ${escapeHtml(fromDateStr)} ➔ ${escapeHtml(toDateStr)}
                                            </div>
                                        </div>
                                        ${(vertLimits || n.schedule || locInfo) ? `
                                            <div style="font-size: 9.5px; color: #555; margin-bottom: 4px; display: flex; gap: 10px; flex-wrap: wrap;">
                                                ${vertLimits ? `<span><strong>Alt:</strong> <span style="color: #1a73e8; font-weight: 700;">${escapeHtml(vertLimits)}</span></span>` : ''}
                                                ${n.schedule ? `<span><strong>Sched:</strong> ${escapeHtml(n.schedule)}</span>` : ''}
                                                ${locInfo ? `<span><strong>Loc:</strong> ${escapeHtml(locInfo)}</span>` : ''}
                                            </div>
                                        ` : ''}
                                        <div style="font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 10px; color: #222; white-space: pre-wrap; background: #fafafa; padding: 5px 8px; border-radius: 3px; border-left: 2px solid #555;">
                                            ${escapeHtml(n.text || n.raw || 'No details available')}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ---------------------------------------------------------
        // 5. PAGE 5: CHECKLISTS
        // ---------------------------------------------------------
        let activeChecklists = DEFAULT_NORMAL_CHECKLISTS;
        if (chkData && Array.isArray(chkData.aircraft) && chkData.aircraft.length > 0) {
            const activeAc = (chkData.activeAircraftId && chkData.aircraft.find(a => a.id === chkData.activeAircraftId)) || chkData.aircraft[0];
            if (activeAc && Array.isArray(activeAc.checklists) && activeAc.checklists.length > 0) {
                activeChecklists = activeAc.checklists;
            }
        } else if (chkData && Array.isArray(chkData.checklists) && chkData.checklists.length > 0) {
            activeChecklists = chkData.checklists;
        }

        // =========================================================
        // ASSEMBLE 6-PAGE KNEEBOARD DOSSIER
        // =========================================================
        return `
            <div id="dossierPrintContainer" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif; color: #111; background: #fff; max-width: 820px; margin: 0 auto; line-height: 1.4;">
                
                <!-- ================= PAGE 1: FLIGHT PLAN, NAVLOG & PILOT BRIEF ================= -->
                <div class="dossier-page" style="padding: 22px; min-height: 1040px; box-sizing: border-box; page-break-after: always;">
                    ${pageHeader('1. Flight Plan & Pilot Briefing', 1)}

                    <!-- Flight Overview Grid -->
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px;">
                        <div style="border: 1.5px solid #000; padding: 8px 10px; background: #fdfdfd;">
                            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #555;">Flight No / Callsign</div>
                            <div style="font-size: 15px; font-weight: 800; margin-top: 2px;">${escapeHtml(flightNumber)}</div>
                        </div>
                        <div style="border: 1.5px solid #000; padding: 8px 10px; background: #fdfdfd;">
                            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #555;">Aircraft &amp; Schedule</div>
                            <div style="font-size: 13px; font-weight: 800; margin-top: 2px;">${escapeHtml(aircraft)}</div>
                            <div style="font-size: 10px; color: #555; margin-top: 1px;">${escapeHtml(dateStr)}${departureTime ? ' &bull; ' + escapeHtml(departureTime) + 'Z' : ''}</div>
                        </div>
                        <div style="border: 1.5px solid #000; padding: 8px 10px; background: #fdfdfd;">
                            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #555;">Pilot in Command / POB</div>
                            <div style="font-size: 12.5px; font-weight: 800; margin-top: 3px;">${escapeHtml(pic)} (POB: ${escapeHtml(pob)})</div>
                        </div>
                        <div style="border: 1.5px solid #000; padding: 8px 10px; background: #fdfdfd;">
                            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #555;">Cruise TAS / Wind</div>
                            <div style="font-size: 12.5px; font-weight: 800; margin-top: 3px;">${tas} kt &nbsp;|&nbsp; ${windDir}° / ${windSpd} kt</div>
                        </div>
                    </div>

                    <!-- Pilot Briefing Remarks & Readiness Checks -->
                    <div style="border: 1.5px solid #000; padding: 10px 12px; background: #fdfdfd; margin-bottom: 14px;">
                        <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px;">
                            Pilot Operational Briefing &amp; Remarks
                        </div>
                        <div style="font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 11px; color: #222; line-height: 1.45; white-space: pre-wrap; margin-bottom: 10px;">
                            ${escapeHtml(notes || 'No operational remarks filed. Standard VFR procedures apply. Verify ATIS and active NOTAMs prior to engine start.')}
                        </div>

                        <!-- Pilot Readiness: IMSAFE Self-Check & Document Status -->
                        <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; border-top: 1px dashed #ccc; padding-top: 8px; font-size: 10px;">
                            <div>
                                <span style="font-weight: 800; text-transform: uppercase; color: #333; display: block; margin-bottom: 4px;">Pilot Fitness (I.M.S.A.F.E.)</span>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                                    ${imsafeItems.map(it => `
                                        <div style="display: flex; align-items: center; gap: 4px;">
                                            <span style="font-size: 11px; font-weight: bold; color: ${it.val ? '#188038' : '#777'};">${it.val ? '☑' : '☐'}</span>
                                            <span><strong>${it.label}</strong>: <span style="color:#555;">${it.desc}</span></span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            <div>
                                <span style="font-weight: 800; text-transform: uppercase; color: #333; display: block; margin-bottom: 4px;">Flight Documentation</span>
                                <div style="display: flex; flex-direction: column; gap: 3px;">
                                    ${docItems.map(d => `
                                        <div style="display: flex; align-items: center; gap: 5px;">
                                            <span style="font-size: 11px; font-weight: bold; color: ${d.val ? '#188038' : '#777'};">${d.val ? '☑' : '☐'}</span>
                                            <span>${d.label}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Navigation Log Table -->
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <h2 style="font-size: 12px; text-transform: uppercase; font-weight: 800; margin: 0;">VFR Navigation Log</h2>
                            <span style="font-size: 9.5px; color: #555;">Altitudes in FT AMSL &bull; Distances in NM &bull; Speeds in KT &bull; Tracks in °MAG</span>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-size: 10.5px;">
                            <thead style="background: #e6e4df;">
                                <tr>
                                    <th style="padding: 6px 8px; border-bottom: 1.5px solid #000; text-align: left; width: 28%;">Leg / Waypoints</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%;">ALT</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%;">Track</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%;">Dist</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%;">Heading</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%;">GS</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%;">ETE</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%; color: #666;">ATO</th>
                                    <th style="padding: 6px 6px; border-bottom: 1.5px solid #000; text-align: center; width: 9%; color: #666;">ETA</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${navRowsHtml}
                            </tbody>
                        </table>
                        <div style="background: #e6e4df; border: 1.5px solid #000; border-top: none; padding: 6px 10px; display: flex; justify-content: space-between; font-size: 11px; font-weight: 800;">
                            <span>Route Totals (${waypoints.length > 1 ? waypoints.length - 1 : 0} legs):</span>
                            <span>Total Distance: ${totDist.toFixed(1)} NM &nbsp;|&nbsp; Estimated Enroute Time: ${totTimeStr}</span>
                        </div>
                    </div>

                    <!-- Pilot Signature Block -->
                    <div style="border: 1px solid #ccc; padding: 8px 12px; background: #fafafa; display: flex; justify-content: space-between; align-items: center; font-size: 10px; margin-top: 10px;">
                        <div>PIC Signature: _________________________________________</div>
                        <div>Date / UTC Time: ___________________________</div>
                        <div>Page 1 / ${totalPages}</div>
                    </div>
                </div>

                <!-- ================= PAGE 2: AERODROME WEATHER (METAR / TAF) ================= -->
                <div class="dossier-page" style="padding: 22px; min-height: 1040px; box-sizing: border-box; page-break-after: always;">
                    ${pageHeader('2. Aerodrome Weather Briefing (METAR & TAF)', 2)}

                    <div style="margin-bottom: 12px; font-size: 11px; color: #444;">
                        Official meteorological reports for departure, enroute, and destination aerodromes selected for this flight.
                    </div>

                    <!-- Selected Airfields Weather Cards -->
                    ${weatherCardsHtml}


                    <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #777; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 14px;">
                        <span>VFR minimums: 1500ft ceiling / 5 km visibility &bull; Check updated reports prior to takeoff</span>
                        <span>Page 2 / ${totalPages}</span>
                    </div>
                </div>

                <!-- ================= PAGE 3: VISUAL ROUTE CHART & PERFORMANCE ================= -->
                <div class="dossier-page" style="padding: 22px; min-height: 1040px; box-sizing: border-box; page-break-after: always;">
                    ${pageHeader('3. Visual Route Chart & Aircraft Performance', 3)}

                    <!-- Visual Route Chart -->
                    <div style="margin-bottom: 16px;">
                        <h2 style="font-size: 12px; text-transform: uppercase; font-weight: 800; margin: 0 0 6px 0;">Visual Route Chart (Flight Track)</h2>
                        ${minimapSvg}
                    </div>

                    <!-- Performance Grid: Speeds & W&B / Fuel -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                        
                        <!-- Left: Normal Operating V-Speeds -->
                        <div style="border: 1.5px solid #000; padding: 10px; background: #fdfdfd;">
                            <h3 style="font-size: 11px; text-transform: uppercase; font-weight: 800; margin: 0 0 6px 0; border-bottom: 1px solid #000; padding-bottom: 3px;">Operating Speeds (POB Profile)</h3>
                            <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
                                <tbody>
                                    ${normalSpeeds.map(s => `
                                        <tr>
                                            <td style="padding: 3.5px 4px; border-bottom: 1px solid #eee; font-weight: 700;">${escapeHtml(s.name)}</td>
                                            <td style="padding: 3.5px 4px; border-bottom: 1px solid #eee; font-family: monospace; font-weight: 800; text-align: right;">${s.value} ${escapeHtml(s.unit || 'kt')}</td>
                                            <td style="padding: 3.5px 4px; border-bottom: 1px solid #eee; color: #555; font-size: 9.5px;">${escapeHtml(s.desc || '')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>

                        <!-- Right: Weight & Balance & Fuel Endurance -->
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="border: 1.5px solid #000; padding: 10px; background: #fdfdfd;">
                                <h3 style="font-size: 11px; text-transform: uppercase; font-weight: 800; margin: 0 0 6px 0; border-bottom: 1px solid #000; padding-bottom: 3px;">Weight &amp; Balance Summary</h3>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10.5px;">
                                    <div>Takeoff Weight: <strong>${tw > 0 ? tw.toFixed(1) : '—'} ${uW}</strong></div>
                                    <div>Max TOW (MTOW): <strong>${mtow} ${uW}</strong></div>
                                    <div>Margin vs MTOW: <strong style="color: ${margin >= 0 ? '#188038' : '#c5221f'};">${margin.toFixed(1)} ${uW}</strong></div>
                                    <div>Center of Gravity: <strong>${calcCg} ${uA}</strong></div>
                                </div>
                            </div>

                            <div style="border: 1.5px solid #000; padding: 10px; background: #fdfdfd;">
                                <h3 style="font-size: 11px; text-transform: uppercase; font-weight: 800; margin: 0 0 6px 0; border-bottom: 1px solid #000; padding-bottom: 3px;">Fuel &amp; Endurance</h3>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10.5px;">
                                    <div>Total Fuel: <strong>${fuelCap} ${uF}</strong></div>
                                    <div>Burn Rate: <strong>${fuelBurn} ${uF}/hr</strong></div>
                                    <div>Max Endurance: <strong>${maxEnduranceHours} hrs</strong></div>
                                    <div>Trip Fuel Est: <strong>${(totTimeMin > 0 && fuelBurn > 0 ? ((totTimeMin / 60) * fuelBurn).toFixed(1) : '—')} ${uF}</strong></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #777; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 14px;">
                        <span>Confirm Weight, Balance and Fuel Reserves are within regulatory limits</span>
                        <span>Page 3 / ${totalPages}</span>
                    </div>
                </div>

                <!-- ================= PAGE 4: AERODROME NOTAMS (JUST BEFORE CHECKLISTS) ================= -->
                <div class="dossier-page" style="padding: 22px; min-height: 1040px; box-sizing: border-box; page-break-after: always;">
                    ${pageHeader('4. Aerodrome NOTAMs (Selected Airfields)', 4)}

                    <div style="margin-bottom: 12px; font-size: 11px; color: #444;">
                        Active Notices to Airmen (NOTAMs) for airfields selected for this flight route. Review runway closures, hazards, and airspace restrictions prior to departure.
                    </div>

                    <!-- NOTAMs Content -->
                    ${notamsHtml}

                    <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #777; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 14px;">
                        <span>Always check live national NOTAM service for tactical updates &bull; Placed prior to operational checklists</span>
                        <span>Page 4 / ${totalPages}</span>
                    </div>
                </div>

                <!-- ================= PAGE 5: NORMAL PROCEDURES CHECKLISTS ================= -->
                <div class="dossier-page" style="padding: 22px; min-height: 1040px; box-sizing: border-box; page-break-after: always;">
                    ${pageHeader('5. Normal Procedures Checklists', 5)}

                    <!-- Multi-column Kneeboard Checklist Cards -->
                    <div style="column-count: 2; column-gap: 14px;">
                        ${activeChecklists.map((chk, idx) => `
                            <div style="break-inside: avoid; border: 1.5px solid #000; margin-bottom: 12px; background: #fff;">
                                <div style="background: #000; color: #fff; padding: 4px 8px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                                    ${idx + 1}. ${escapeHtml(chk.title)}
                                </div>
                                <div style="padding: 5px 8px;">
                                    ${(chk.items || []).map(item => `
                                        <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 10px; padding: 2.5px 0; border-bottom: 1px dotted #ccc;">
                                            <span style="font-weight: 500; padding-right: 8px;">${escapeHtml(item.text)}</span>
                                            <span style="font-weight: 800; font-family: monospace; white-space: nowrap; text-transform: uppercase;">${escapeHtml(item.value || 'CHECK')}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #777; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 14px;">
                        <span>Aviate &bull; Navigate &bull; Communicate &bull; Complete checklist items systematically</span>
                        <span>Page 5 / ${totalPages}</span>
                    </div>
                </div>

                <!-- ================= PAGE 6: EMERGENCY PROCEDURES & QUICK REFERENCE ================= -->
                <div class="dossier-page" style="padding: 22px; min-height: 1040px; box-sizing: border-box;">
                    ${pageHeader('6. Emergency Procedures & Quick Reference', 6)}

                    <!-- Emergency Speeds Banner -->
                    <div style="border: 2px solid #c5221f; background: #fce8e6; padding: 8px 12px; margin-bottom: 12px; border-radius: 4px;">
                        <div style="font-size: 10.5px; font-weight: 800; color: #c5221f; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px;">
                            CRITICAL EMERGENCY SPEEDS (V-SPEEDS)
                        </div>
                        <div style="display: flex; gap: 20px; flex-wrap: wrap; font-size: 11px; font-weight: 700; color: #c5221f;">
                            ${emergencySpeeds.map(s => `
                                <div>${escapeHtml(s.name)}: <span style="font-size: 13px; font-weight: 900; font-family: monospace;">${s.value} ${escapeHtml(s.unit || 'kt')}</span></div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Emergency Checklists (2 columns) -->
                    <div style="column-count: 2; column-gap: 14px; margin-bottom: 14px;">
                        ${DEFAULT_EMERGENCY_CHECKLISTS.map(chk => `
                            <div style="break-inside: avoid; border: 2px solid #c5221f; margin-bottom: 12px; background: #fff;">
                                <div style="background: #c5221f; color: #fff; padding: 4px 8px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                                    EMERGENCY: ${escapeHtml(chk.title)}
                                </div>
                                <div style="padding: 5px 8px;">
                                    ${chk.items.map(item => `
                                        <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 9.5px; padding: 3px 0; border-bottom: 1px dotted #ffcdd2;">
                                            <span style="font-weight: 600; color: #222; padding-right: 6px;">${escapeHtml(item.text)}</span>
                                            <span style="font-weight: 900; font-family: monospace; color: #b71c1c; white-space: nowrap;">${escapeHtml(item.value)}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Special Reference Cards: Transponder & Light Gun Signals -->
                    <div style="display: grid; grid-template-columns: 1fr 1.6fr; gap: 12px; margin-bottom: 12px;">
                        
                        <!-- Transponder Codes -->
                        <div style="border: 1.5px solid #000; padding: 8px 10px; background: #fdfdfd;">
                            <h4 style="margin: 0 0 5px 0; font-size: 10.5px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px;">
                                Emergency Transponder Codes
                            </h4>
                            <div style="font-size: 10px; line-height: 1.55;">
                                <div><strong style="font-family: monospace; font-size: 12px; color: #c5221f;">7700</strong> &bull; General Emergency (Mayday)</div>
                                <div><strong style="font-family: monospace; font-size: 12px; color: #1967d2;">7600</strong> &bull; Radio Comms Failure (NORDO)</div>
                                <div><strong style="font-family: monospace; font-size: 12px; color: #b06000;">7500</strong> &bull; Unlawful Interference (Hijack)</div>
                                <div><strong style="font-family: monospace; font-size: 11px;">7000</strong> &bull; VFR Standard (Europe / ICAO)</div>
                            </div>
                        </div>

                        <!-- ATC Light Gun Signals -->
                        <div style="border: 1.5px solid #000; padding: 8px 10px; background: #fdfdfd;">
                            <h4 style="margin: 0 0 5px 0; font-size: 10.5px; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px;">
                                ATC Light Gun Signals (Loss of Comms)
                            </h4>
                            <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
                                <thead style="background: #eee;">
                                    <tr>
                                        <th style="padding: 2.5px 4px; text-align: left;">Signal</th>
                                        <th style="padding: 2.5px 4px; text-align: left;">On Ground</th>
                                        <th style="padding: 2.5px 4px; text-align: left;">In Flight</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="padding: 2.5px 4px; font-weight: 700; color: #188038;">Steady Green</td>
                                        <td style="padding: 2.5px 4px;">Cleared for Takeoff</td>
                                        <td style="padding: 2.5px 4px;">Cleared to Land</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="padding: 2.5px 4px; font-weight: 700; color: #188038;">Flashing Green</td>
                                        <td style="padding: 2.5px 4px;">Cleared to Taxi</td>
                                        <td style="padding: 2.5px 4px;">Return for Landing</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="padding: 2.5px 4px; font-weight: 700; color: #c5221f;">Steady Red</td>
                                        <td style="padding: 2.5px 4px;">STOP</td>
                                        <td style="padding: 2.5px 4px;">Give way / Keep circling</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #eee;">
                                        <td style="padding: 2.5px 4px; font-weight: 700; color: #c5221f;">Flashing Red</td>
                                        <td style="padding: 2.5px 4px;">Taxi clear of runway</td>
                                        <td style="padding: 2.5px 4px;">Airport unsafe, do not land</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 2.5px 4px; font-weight: 700; color: #555;">Flashing White</td>
                                        <td style="padding: 2.5px 4px;">Return to start point</td>
                                        <td style="padding: 2.5px 4px;">Not applicable</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: #777; border-top: 1px solid #ddd; padding-top: 8px;">
                        <span>Maintain aircraft control &bull; Fly the airplane first &bull; Squawk 7600/7700 as required</span>
                        <span>Page 6 / ${totalPages} &bull; End of Flight Dossier</span>
                    </div>
                </div>

            </div>
        `;
    }

    // ==========================================
    // PREVIEW MODAL & EXPORT ACTIONS
    // ==========================================
    function ensureModalExists() {
        if (document.getElementById('flightDossierModal')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'flightDossierModal';
        modalDiv.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.65);
            z-index: 99999;
            align-items: center;
            justify-content: center;
            padding: 20px;
            backdrop-filter: blur(4px);
        `;

        modalDiv.innerHTML = `
            <div style="background: var(--card-bg, #fff); color: var(--text-color, #111); border: 2px solid var(--border-color, #111); border-radius: 8px; width: 100%; max-width: 900px; max-height: 94vh; display: flex; flex-direction: column; box-shadow: 0 16px 40px rgba(0,0,0,0.35); overflow: hidden;">
                <!-- Header Toolbar -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 2px solid var(--border-color, #111); background: var(--bg-color, #f6f4f0);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">✈️</span>
                        <div>
                            <div style="font-size: 15px; font-weight: 800; text-transform: uppercase;">In-Flight Dossier &amp; Kneeboard</div>
                            <div style="font-size: 11px; color: var(--muted-text, #666);">Print-ready flight packet &bull; 6 Pages</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button id="dossierPrintBtn" class="btn-action" style="padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; border: 1.5px solid var(--border-color, #111); border-radius: 4px; background: var(--card-bg, #fff); color: var(--text-color, #111);">
                            🖨️ Print / Save as PDF
                        </button>
                        <button id="dossierDownloadBtn" class="btn-action primary" style="padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; border: 1.5px solid var(--border-color, #111); border-radius: 4px; background: var(--border-color, #111); color: var(--bg-color, #fff);">
                            📥 Download PDF
                        </button>
                        <button id="dossierCloseBtn" style="padding: 5px 10px; font-size: 16px; border: 1px solid var(--border-color, #111); border-radius: 4px; background: transparent; cursor: pointer; margin-left: 6px; color: var(--text-color, #111);">
                            ✕
                        </button>
                    </div>
                </div>

                <!-- Preview Body (Scrollable) -->
                <div id="dossierModalBody" style="padding: 24px; overflow-y: auto; background: #525659; flex: 1;">
                    <!-- Injected at runtime -->
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);

        // Bind modal events
        document.getElementById('dossierCloseBtn').addEventListener('click', closeDossierModal);
        modalDiv.addEventListener('click', e => {
            if (e.target === modalDiv) closeDossierModal();
        });

        document.getElementById('dossierPrintBtn').addEventListener('click', () => {
            const printContent = document.getElementById('dossierPrintContainer');
            if (!printContent) return;

            // Create temporary iframe for clean printing
            const printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            document.body.appendChild(printFrame);

            const doc = printFrame.contentWindow.document;
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>In-Flight Dossier</title>
                    <style>
                        @page { size: A4 portrait; margin: 0.2in; }
                        body { margin: 0; padding: 0; background: #fff; font-family: 'Inter', -apple-system, sans-serif; }
                        .dossier-page { page-break-after: always; min-height: 98vh; box-sizing: border-box; }
                        .dossier-page:last-child { page-break-after: avoid; }
                    </style>
                </head>
                <body>
                    ${printContent.outerHTML}
                </body>
                </html>
            `);
            doc.close();

            printFrame.contentWindow.focus();
            setTimeout(() => {
                printFrame.contentWindow.print();
                setTimeout(() => printFrame.remove(), 1000);
            }, 500);
        });

        document.getElementById('dossierDownloadBtn').addEventListener('click', () => {
            const container = document.getElementById('dossierPrintContainer');
            if (!container) return;

            const dlBtn = document.getElementById('dossierDownloadBtn');
            const origText = dlBtn.innerHTML;
            dlBtn.innerHTML = '⏳ Generating PDF...';
            dlBtn.disabled = true;

            const info = JSON.parse(localStorage.getItem(INFO_KEY) || '{}');
            const filename = `Complete_Dossier_${info.flightNumber && info.flightNumber !== 'N/A' ? info.flightNumber : 'Flight'}_${new Date().toISOString().split('T')[0]}.pdf`;

            if (typeof window.html2pdf === 'function') {
                const opt = {
                    margin: [0.15, 0.15, 0.15, 0.15],
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
                    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'], after: '.dossier-page' }
                };

                window.html2pdf().set(opt).from(container).save().then(() => {
                    dlBtn.innerHTML = origText;
                    dlBtn.disabled = false;
                }).catch(err => {
                    console.error("PDF generation failed:", err);
                    alert("Could not generate PDF directly. Opening print dialog instead.");
                    dlBtn.innerHTML = origText;
                    dlBtn.disabled = false;
                    window.print();
                });
            } else {
                alert("Opening print dialog to Save as PDF...");
                dlBtn.innerHTML = origText;
                dlBtn.disabled = false;
                window.print();
            }
        });
    }

    function openDossierModal() {
        ensureModalExists();
        const bodyEl = document.getElementById('dossierModalBody');
        if (bodyEl) {
            bodyEl.innerHTML = buildDossierHtml();
        }
        const modal = document.getElementById('flightDossierModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    function closeDossierModal() {
        const modal = document.getElementById('flightDossierModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    function injectDefaultStyles() {
        if (document.getElementById('flightDossierDefaultStyles')) return;
        const style = document.createElement('style');
        style.id = 'flightDossierDefaultStyles';
        style.textContent = `
            .sidebar-export-wrap {
                padding: 20px 25px;
                box-sizing: border-box;
            }
            .btn-export-bw, .btn-export-dossier {
                background-color: var(--text-color, #111);
                color: var(--bg-color, #fff);
                border: 2px solid var(--text-color, #111);
                padding: 13px 16px;
                font-size: 13px;
                font-weight: 700;
                font-family: 'Inter', sans-serif;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                width: 100%;
                box-sizing: border-box;
            }
            .btn-export-bw:hover, .btn-export-dossier:hover {
                background-color: transparent;
                color: var(--text-color, #111);
            }
            .btn-export-bw:disabled, .btn-export-dossier:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }

    // Export to global scope
    window.FlightDossier = {
        open: openDossierModal,
        close: closeDossierModal,
        generateHtml: buildDossierHtml
    };

    // Auto-bind any button with id="exportFlightDocBtn" or class="btn-export-dossier"
    function bindButtons() {
        injectDefaultStyles();
        document.querySelectorAll('#exportFlightDocBtn, .btn-export-dossier, #exportFullDossierBtn').forEach(btn => {
            if (!btn.dataset.dossierBound) {
                btn.dataset.dossierBound = 'true';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    openDossierModal();
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindButtons);
    } else {
        bindButtons();
    }

})();
