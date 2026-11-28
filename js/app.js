/* ---------- Cấu hình Supabase ---------- */
var SUPABASE_URL = 'https://zqjeuzjhxfbefgjdohov.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_Jl9ls2iLC_zN7foUJpoRDw_Tx9lZ9wu';

var isSupabaseConfigured = SUPABASE_URL.indexOf('YOUR_PROJECT_ID') === -1 && SUPABASE_ANON_KEY.indexOf('YOUR_ANON') === -1;
var sb = isSupabaseConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

var currentUser = null;
var currentProfile = null;
var cloudSchools = [];
var isPickingCoord = false;
var isRegisterMode = false;

/* ---------- Khởi tạo Bản đồ ---------- */
var map = L.map('map', {
    preferCanvas: true,
    zoomControl: false,
    maxZoom: 28,
    minZoom: 1,
    zoomSnap: 1,
    wheelDebounceTime: 60
}).fitBounds([[12.174354833807548, 109.07921389237521], [12.358834987930187, 109.28610531841812]]);

new L.Hash(map);
map.attributionControl.setPrefix('<a href="https://github.com/qgis2web/qgis2web" target="_blank">qgis2web</a> &middot; <a href="https://leafletjs.com">Leaflet</a> &middot; <a href="https://supabase.com">Supabase PostGIS</a>');
var autolinker = new Autolinker({truncate: {length: 30, location: 'smart'}});

L.control.zoom({position: 'topleft'}).addTo(map);

var locateControl = L.control.locate({
    position: 'topleft',
    locateOptions: { maxZoom: 18, enableHighAccuracy: true },
    flyTo: true,
    strings: {
        title: "Chỗ hiện tại của tôi",
        popup: "Vị trí hiện tại của bạn (sai số khoảng {distance} {unit})",
        outsideMapBoundsMsg: "Vị trí của bạn nằm ngoài phạm vi bản đồ"
    }
}).addTo(map);

map.createPane('pane_vector').style.zIndex = 401;
var vectorRenderer = L.canvas({pane: 'pane_vector', padding: 0.3});

/* ---------- LỚP NỀN BẢN ĐỒ ---------- */
var googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20, attribution: 'Google Satellite'
});
var blankLayer = L.layerGroup().addTo(map);

var baseTree = [
    { label: '<b style="font-size:13px;">Bản đồ mặc định</b>', layer: blankLayer },
    { label: '<b style="font-size:13px;">Google Vệ tinh</b>', layer: googleSatLayer }
];

/* ---------- CẮT MẶT NẠ CHE NGOÀI NHA TRANG ---------- */
map.createPane('pane_mask');
map.getPane('pane_mask').style.zIndex = 399;

var nhaTrangMask = null;
function createNhaTrangMask() {
    var holes = [];
    json_NhaTrang_KetQua_0.features.forEach(function(feature) {
        var geom = feature.geometry;
        if (geom.type === 'Polygon') {
            geom.coordinates.forEach(function(ring) { holes.push(ring.map(function(pt) { return [pt[1], pt[0]]; })); });
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(function(poly) {
                poly.forEach(function(ring) { holes.push(ring.map(function(pt) { return [pt[1], pt[0]]; })); });
            });
        }
    });
    var worldCoords = [[90, -180], [90, 180], [-90, 180], [-90, -180]];
    nhaTrangMask = L.polygon([worldCoords].concat(holes), {
        pane: 'pane_mask', stroke: false, fillColor: '#b9d9e8', fillOpacity: 1, interactive: false
    }).addTo(map);
}
createNhaTrangMask();

/* ---------- Hàm xử lý Popup HTML ---------- */
function val(v) { return (v !== null && v !== undefined) ? autolinker.link(String(v)) : ''; }

function popupHTML(properties, fieldMap, extraRows) {
    var rows = '';
    for (var key in fieldMap) {
        if (properties[key] !== null && properties[key] !== undefined && properties[key] !== '') {
            rows += '<tr><th scope="row" style="text-align:left; padding-right:8px;">' + fieldMap[key] + '</th><td>' + val(properties[key]) + '</td></tr>';
        }
    }
    return '<table style="font-size:13px;">' + rows + (extraRows || '') + '</table>';
}

function highlightFeature(e) {
    var layer = e.target;
    if (layer.feature.geometry.type.indexOf('Line') !== -1) {
        layer.setStyle({ color: 'rgba(255, 255, 0, 1.00)' });
    } else {
        layer.setStyle({ fillColor: 'rgba(255, 255, 0, 1.00)', fillOpacity: 0.7 });
    }
}

/* ---------- Lớp 0: NhaTrang_KetQua ---------- */
map.createPane('pane_NhaTrang_KetQua_0');
map.getPane('pane_NhaTrang_KetQua_0').style.zIndex = 400;

function formatPercent(v) {
    if (v === null || v === undefined || isNaN(v)) return 'Chưa có dữ liệu';
    return parseFloat(v).toFixed(1).replace('.', ',') + '%';
}

function getRatingBadge(v) {
    if (v === null || v === undefined || isNaN(v)) return '';
    var num = parseFloat(v);
    if (num < 10) return ' <span style="color:#ef4444; font-weight:bold; font-size:11px; background:#fee2e2; padding:2px 6px; border-radius:4px;">(Rất thấp)</span>';
    if (num < 30) return ' <span style="color:#ea580c; font-weight:bold; font-size:11px; background:#ffedd5; padding:2px 6px; border-radius:4px;">(Thấp)</span>';
    if (num < 60) return ' <span style="color:#d97706; font-weight:bold; font-size:11px; background:#fef3c7; padding:2px 6px; border-radius:4px;">(Trung bình)</span>';
    return ' <span style="color:#16a34a; font-weight:bold; font-size:11px; background:#dcfce7; padding:2px 6px; border-radius:4px;">(Tốt)</span>';
}

var wardSatMode = false;
function wardStyle(feature) {
    if (wardSatMode) return { opacity: 1, color: '#ffffff', weight: 1.5, fill: true, fillOpacity: 0.05, fillColor: '#ffffff', interactive: true };
    return { opacity: 1, color: '#7f9486', weight: 1.0, fill: true, fillOpacity: 0.92, fillColor: '#f7f5ee', interactive: true };
}

var layer_NhaTrang_KetQua_0 = new L.geoJson(json_NhaTrang_KetQua_0, {
    pane: 'pane_NhaTrang_KetQua_0',
    style: wardStyle,
    onEachFeature: function(feature, layer) {
        layer.on({
            mouseover: highlightFeature,
            mouseout: function(e) { layer_NhaTrang_KetQua_0.resetStyle(e.target); }
        });
        var p = feature.properties;
        var diBoVal = p['TyLe_DiBo400'];
        var xeMayVal = p['TyLe_XeMay2500'];
        var customPopup =
            '<div style="min-width:210px; padding:2px;">' +
                '<h4 style="margin:0 0 8px 0; color:#1e293b; border-bottom:2px solid #2563eb; padding-bottom:4px; font-size:15px;">' +
                    '📍 Phường / Xã: <b>' + (p['NAME_3'] || 'Không rõ') + '</b>' +
                '</h4>' +
                '<div style="margin-bottom:8px; font-size:13px; color:#334155;">' +
                    '<b>🚶 Tiếp cận đi bộ (400m):</b><br/>' +
                    '<span style="font-size:15px; font-weight:700; color:#0f172a;">' + formatPercent(diBoVal) + '</span> ' + getRatingBadge(diBoVal) +
                '</div>' +
                '<div style="font-size:13px; color:#334155;">' +
                    '<b>🛵 Tiếp cận xe máy (2.5km):</b><br/>' +
                    '<span style="font-size:15px; font-weight:700; color:#0f172a;">' + formatPercent(xeMayVal) + '</span> ' + getRatingBadge(xeMayVal) +
                '</div>' +
            '</div>';
        layer.bindPopup(customPopup, { maxHeight: 400 });
    }
});
map.addLayer(layer_NhaTrang_KetQua_0);

map.on('baselayerchange', function(e) {
    wardSatMode = (e.layer === googleSatLayer);
    layer_NhaTrang_KetQua_0.setStyle(wardStyle);
    if (nhaTrangMask) nhaTrangMask.setStyle(wardSatMode ? { fillColor: '#0b2a3d', fillOpacity: 0.9 } : { fillColor: '#b9d9e8', fillOpacity: 1 });
});

/* ---------- Lớp 1: Mạng lưới Đường ---------- */
map.createPane('pane_CatDuonggkpgcat_Duong_1');
map.getPane('pane_CatDuonggkpgcat_Duong_1').style.zIndex = 401;

var layer_CatDuonggkpgcat_Duong_1 = new L.geoJson(json_CatDuonggkpgcat_Duong_1, {
    pane: 'pane_CatDuonggkpgcat_Duong_1',
    renderer: vectorRenderer,
    smoothFactor: 2.5,
    interactive: false,
    style: function(feature) {
        var loai = String(feature.properties['LoaiDuong']);
        var color = loai === 'Cầu' ? 'rgba(247,240,19,1.0)' : (loai === 'Đường chính' ? 'rgba(125,118,174,1.0)' : 'rgba(170,170,170,1.0)');
        return { opacity: 0.8, color: color, weight: 1.2, fillOpacity: 0 };
    }
});
map.addLayer(layer_CatDuonggkpgcat_Duong_1);

/* ---------- Lớp 2 & 3: Vùng đệm ---------- */
map.createPane('pane_DiBo_400m_Polygon_2');
map.getPane('pane_DiBo_400m_Polygon_2').style.zIndex = 402;
var layer_DiBo_400m_Polygon_2 = new L.geoJson(json_DiBo_400m_Polygon_2, {
    pane: 'pane_DiBo_400m_Polygon_2',
    style: function() { return { opacity: 1, color: 'rgba(35,35,35,1.0)', weight: 1.0, fill: true, fillOpacity: 0.5, fillColor: 'rgba(231,113,72,1.0)', interactive: true }; }
});

map.createPane('pane_XeMay_2500m_Polygon_3');
map.getPane('pane_XeMay_2500m_Polygon_3').style.zIndex = 403;
var layer_XeMay_2500m_Polygon_3 = new L.geoJson(json_XeMay_2500m_Polygon_3, {
    pane: 'pane_XeMay_2500m_Polygon_3',
    style: function() { return { opacity: 1, color: 'rgba(35,35,35,1.0)', weight: 1.0, fill: true, fillOpacity: 0.4, fillColor: 'rgba(229,182,54,1.0)', interactive: true }; }
});

/* ---------- Lớp 4: Trạm Bus ---------- */
map.createPane('pane_Tram_BusTramBus_4');
map.getPane('pane_Tram_BusTramBus_4').style.zIndex = 404;

var busIcon = L.icon({ iconUrl: 'legend/Tram_BusTramBus_4.png', iconSize: [24, 24] });
var layer_Tram_BusTramBus_4 = new L.geoJson(json_Tram_BusTramBus_4, {
    pane: 'pane_Tram_BusTramBus_4',
    pointToLayer: function(f, latlng) { return L.marker(latlng, { icon: busIcon, interactive: true }); },
    onEachFeature: function(feature, layer) { layer.bindPopup(popupHTML(feature.properties, {'name': 'Tên trạm Bus'}), {maxHeight: 400}); }
});

function updateBusVisibility() {
    var z = map.getZoom();
    if (z >= 14 && z <= 19) {
        if (!map.hasLayer(layer_Tram_BusTramBus_4)) map.addLayer(layer_Tram_BusTramBus_4);
    } else {
        if (map.hasLayer(layer_Tram_BusTramBus_4)) map.removeLayer(layer_Tram_BusTramBus_4);
    }
}
map.on("zoomend", updateBusVisibility);
updateBusVisibility();

/* ---------- Lớp 5: Trường học ---------- */
map.createPane('pane_TruongHoctruonghoc_nhatrang_5');
map.getPane('pane_TruongHoctruonghoc_nhatrang_5').style.zIndex = 405;

function mkSchoolIcon(fileName, size) {
    return L.icon({
        iconUrl: 'legend/' + fileName,
        iconSize: size,
        iconAnchor: [size[0] / 2, size[1] / 2],
        popupAnchor: [0, -size[1] / 2]
    });
}

function getSchoolIcon(capHoc, scale) {
    scale = scale || 1.0;
    capHoc = String(capHoc || '');
    if (capHoc.indexOf('Đại học') !== -1 || capHoc.indexOf('Cao đẳng') !== -1) return mkSchoolIcon('0.png', [Math.round(65 * scale), Math.round(65 * scale)]);
    if (capHoc.indexOf('THPT') !== -1) return mkSchoolIcon('1.png', [Math.round(70 * scale), Math.round(70 * scale)]);
    if (capHoc.indexOf('THCS') !== -1) return mkSchoolIcon('2.png', [Math.round(70 * scale), Math.round(70 * scale)]);
    if (capHoc.indexOf('Tiểu học') !== -1) return mkSchoolIcon('3.png', [Math.round(65 * scale), Math.round(65 * scale)]);
    return mkSchoolIcon('4.png', [Math.round(65 * scale), Math.round(65 * scale)]);
}

var layer_TruongHoctruonghoc_nhatrang_5 = new L.geoJson(json_TruongHoctruonghoc_nhatrang_5, {
    pane: 'pane_TruongHoctruonghoc_nhatrang_5',
    pointToLayer: function (feature, latlng) {
        return L.marker(latlng, { icon: getSchoolIcon(feature.properties['CapHoc'], 1.0), interactive: true });
    },
    onEachFeature: function(feature, layer) {
        bindSchool(feature, layer);
    }
});
map.addLayer(layer_TruongHoctruonghoc_nhatrang_5);

var SCHOOL_FIELDS = { 'name': 'Tên trường', 'CapHoc': 'Cấp học', 'LoaiHinh': 'Loại hình' };

/* Mức tiếp cận của một trường so với điểm xuất phát hiện tại (khoảng cách đường chim bay) */
function accessInfo(marker) {
    var cap = String(marker.feature.properties['CapHoc'] || '');
    var dist = currentOrigin.latlng.distanceTo(marker.getLatLng());
    var walkLimit = (cap.indexOf('Mầm non') !== -1 || cap.indexOf('Tiểu học') !== -1) ? 400 : 800;
    if (dist <= walkLimit) return { dist: dist, text: '🟢 <b>Dễ tiếp cận (Đi bộ)</b>', color: '#16a34a', filter: 'drop-shadow(0 0 8px #22c55e)', opacity: '1' };
    if (dist <= 2500) return { dist: dist, text: '🟡 <b>Cần cân nhắc (Đi xe máy)</b>', color: '#d97706', filter: 'drop-shadow(0 0 6px #eab308)', opacity: '0.9' };
    return { dist: dist, text: '🔴 <b>Khá xa (>2,5km)</b>', color: '#dc2626', filter: 'grayscale(50%)', opacity: '0.65' };
}

function schoolDetailHtml(p, a) {
    return '<div style="min-width:210px;">' +
        '<h4 style="margin:0 0 6px 0; color:#1e293b; border-bottom:2px solid #2563eb; padding-bottom:4px;">' + (p['name'] || 'Trường học') + '</h4>' +
        '<div style="font-size:12.5px; margin-bottom:4px;"><b>Cấp học:</b> ' + (p['CapHoc'] || 'Chưa cập nhật') + '</div>' +
        '<div style="font-size:12.5px; margin-bottom:4px;"><b>Trạng thái:</b> ' + a.text + '</div>' +
        '<div style="font-size:13px; background:#f1f5f9; padding:6px 8px; border-radius:5px; margin-top:6px;">' +
            '📍 Cách <b>' + currentOrigin.label + '</b>: <b style="color:' + a.color + '; font-size:14px;">' + formatDistance(a.dist) + '</b></div></div>';
}

/* Gắn popup và sự kiện click cho một trường (chỉ gắn một lần khi tạo marker) */
function bindSchool(feature, layer) {
    layer.bindPopup(function() {
        return currentOrigin ? schoolDetailHtml(feature.properties, accessInfo(layer)) : popupHTML(feature.properties, SCHOOL_FIELDS);
    }, { maxHeight: 400 });
    layer.off('click').on('click', function() {
        if (isPickingCoord) return;
        if (currentOrigin) drawConnectionLine(currentOrigin.latlng, layer);
        layer.openPopup();
    });
}

function updateSchoolIconSizes() {
    var z = map.getZoom();
    var scale = 1.0;
    if (z <= 12) scale = 0.65;
    else if (z === 13) scale = 0.8;
    else if (z === 14) scale = 1.0;
    else if (z === 15) scale = 1.25;
    else if (z === 16) scale = 1.5;
    else if (z >= 17) scale = 1.75;

    layer_TruongHoctruonghoc_nhatrang_5.eachLayer(function(marker) {
        marker.setIcon(getSchoolIcon(marker.feature.properties['CapHoc'], scale));
    });
}
map.on('zoomend', updateSchoolIconSizes);

/* ---------- Bảng Chú giải góc phải ---------- */
function legendIcon(file) {
    return '<tr><td style="text-align:center; width:64px; height:40px; padding:0;"><img src="legend/' + file + '" style="width:64px; height:64px; margin:-12px 0; object-fit:contain; vertical-align:middle;"/></td>';
}

var legendCriteria = '<div style="margin-top:10px; padding-top:8px; border-top:1px solid #cbd5e1; font-size:12px; line-height:1.5; color:#334155;">' +
    '<b style="color:#0f172a; font-size:12.5px;">Tiêu chuẩn đánh giá tiếp cận:</b><br/>' +
    '<div style="margin-top:4px;">🟢 <b>Dễ tiếp cận (Đi bộ):</b><br/>&nbsp;&nbsp;• ≤ 400m (Mầm non / Tiểu học)<br/>&nbsp;&nbsp;• ≤ 800m (THCS / THPT / Đại học)</div>' +
    '<div style="margin-top:4px;">🟡 <b>Cần cân nhắc (Đi xe máy):</b><br/>&nbsp;&nbsp;• 800m – 2,5 km</div>' +
    '<div style="margin-top:4px;">🔴 <b>Khá xa:</b><br/>&nbsp;&nbsp;• > 2,5 km</div></div>';

var schoolLegendTable = '<b style="font-size:15px; color:#1e293b;">Trường học Nha Trang</b><br />' +
    '<table style="margin-top: 6px; font-size: 14px;">' +
    legendIcon('0.png') + '<td style="padding-left:8px;">Đại học / Cao đẳng</td></tr>' +
    legendIcon('1.png') + '<td style="padding-left:8px;">THPT</td></tr>' +
    legendIcon('2.png') + '<td style="padding-left:8px;">THCS</td></tr>' +
    legendIcon('3.png') + '<td style="padding-left:8px;">Tiểu học</td></tr>' +
    legendIcon('4.png') + '<td style="padding-left:8px;">Mầm non / Mẫu giáo</td></tr>' +
    '</table>' + legendCriteria;

var overlaysTree = [
    { label: schoolLegendTable, layer: layer_TruongHoctruonghoc_nhatrang_5 },
    { label: '<span style="display:inline-block; width:14px; height:14px; background:#8b5cf6; border-radius:50%; vertical-align:middle; margin-right:8px; border:1px solid #fff;"></span><b style="font-size:13px;">Trạm xe buýt</b>', layer: layer_Tram_BusTramBus_4 },
    { label: '<span style="display:inline-block; width:16px; height:16px; background:rgba(229,182,54,0.75); border:1px solid #b8860b; vertical-align:middle; margin-right:8px; border-radius:3px;"></span><b style="font-size:13px;">Vùng đệm xe máy 2.5km</b>', layer: layer_XeMay_2500m_Polygon_3 },
    { label: '<span style="display:inline-block; width:16px; height:16px; background:rgba(231,113,72,0.75); border:1px solid #c0392b; vertical-align:middle; margin-right:8px; border-radius:3px;"></span><b style="font-size:13px;">Vùng đệm đi bộ 400m</b>', layer: layer_DiBo_400m_Polygon_2 },
    { label: '<span style="display:inline-block; width:20px; height:4px; background:#7d76ae; vertical-align:middle; margin-right:8px;"></span><b style="font-size:13px;">Mạng lưới giao thông</b>', layer: layer_CatDuonggkpgcat_Duong_1 },
    { label: '<span style="display:inline-block; width:16px; height:16px; background:#f7f5ee; border:1px solid #7f9486; vertical-align:middle; margin-right:8px; border-radius:3px;"></span><b style="font-size:13px;">Ranh giới Phường/Xã</b>', layer: layer_NhaTrang_KetQua_0 }
];
L.control.layers.tree(baseTree, overlaysTree, { collapsed: false }).addTo(map);

/* ---------- Hiển thị Nhãn ---------- */
var labelLayers = [layer_NhaTrang_KetQua_0, layer_TruongHoctruonghoc_nhatrang_5];

function applySchoolLabels() {
    layer_TruongHoctruonghoc_nhatrang_5.eachLayer(function(layer) {
        var name = layer.feature.properties['name'];
        if (name) {
            layer.bindTooltip(
                '<div style="color:#1e40af; font-size:9pt; font-weight:700; text-align:center; text-shadow:-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;">' + name + '</div>',
                { permanent: true, direction: 'top', offset: [0, -12], className: 'css_TruongHoctruonghoc_nhatrang_5' }
            );
        }
    });
}

function applyLabels() {
    layer_NhaTrang_KetQua_0.eachLayer(function(layer) {
        var name = layer.feature.properties['NAME_3'];
        if (name) {
            layer.bindTooltip('<div style="color: #323232; font-size: 10pt; font-weight: 600;">' + name + '</div>',
            { permanent: true, direction: 'center', className: 'css_NhaTrang_KetQua_0' });
        }
    });
    applySchoolLabels();
}
applyLabels();
resetLabels(labelLayers);

/* ---------- Xử lý Nhãn Tên Đường ---------- */
var roadTooltips = [];
var roadTimer = null;

function updateRoadLabels() {
    for (var i = 0; i < roadTooltips.length; i++) map.removeLayer(roadTooltips[i]);
    roadTooltips = [];
    var currentZoom = map.getZoom();
    if (currentZoom < 16) return;
    var viewBounds = map.getBounds().pad(0.05);
    var seenNames = {};
    layer_CatDuonggkpgcat_Duong_1.eachLayer(function(road) {
        var roadName = road.feature.properties['name'];
        if (!roadName || seenNames[roadName]) return;
        if (roadName.toLowerCase().indexOf('hẻm') !== -1 && currentZoom < 17) return;
        var roadBounds = road.getBounds();
        if (viewBounds.intersects(roadBounds)) {
            seenNames[roadName] = true;
            var tt = L.tooltip({ permanent: true, direction: 'center', className: 'css_road_label' })
                .setContent(roadName).setLatLng(roadBounds.getCenter());
            tt.addTo(map);
            roadTooltips.push(tt);
        }
    });
}

map.on("moveend zoomend", function() {
    resetLabels(labelLayers);
    clearTimeout(roadTimer);
    roadTimer = setTimeout(updateRoadLabels, 150);
});

/* ---------- BỘ LỌC PHƯỜNG / XÃ & CẤP HỌC ---------- */
var wardSelect = document.getElementById('wardSelect');
var wardList = [];
layer_NhaTrang_KetQua_0.eachLayer(function(l) {
    var name = l.feature.properties['NAME_3'];
    if (name && wardList.indexOf(name) === -1) wardList.push(name);
});
wardList.sort().forEach(function(w) {
    var opt = document.createElement('option');
    opt.value = w; opt.textContent = w;
    wardSelect.appendChild(opt);
});

var schoolTypeSelect = document.getElementById('schoolTypeSelect');
function applySchoolTypeFilter() {
    var type = schoolTypeSelect.value;
    layer_TruongHoctruonghoc_nhatrang_5.eachLayer(function(marker) {
        var cap = String(marker.feature.properties['CapHoc'] || '');
        var match = !type ||
            (type === 'DaiHoc' && (cap.indexOf('Đại học') !== -1 || cap.indexOf('Cao đẳng') !== -1)) ||
            (type === 'THPT' && cap.indexOf('THPT') !== -1) ||
            (type === 'THCS' && cap.indexOf('THCS') !== -1) ||
            (type === 'TieuHoc' && cap.indexOf('Tiểu học') !== -1) ||
            (type === 'MamNon' && (cap.indexOf('Mầm non') !== -1 || cap.indexOf('Mẫu giáo') !== -1));
        if (marker.getElement()) marker.getElement().style.display = match ? 'block' : 'none';
        var tt = marker.getTooltip() && marker.getTooltip().getElement();
        if (tt) {
            tt.style.display = match ? 'block' : 'none';
            if (type && match) tt.style.opacity = '1';
        }
    });
    if (!type) resetLabels(labelLayers);
}
schoolTypeSelect.addEventListener('change', applySchoolTypeFilter);

/* ---------- THANH TÌM KIẾM ---------- */
var searchIndex = [];
function rebuildSearchIndex() {
    searchIndex = [];
    layer_TruongHoctruonghoc_nhatrang_5.eachLayer(function(l) {
        if (l.feature.properties['name']) {
            searchIndex.push({ id: l.feature.properties['id'] || null, name: l.feature.properties['name'], type: 'Trường học', layer: l, latlng: l.getLatLng() });
        }
    });
    layer_Tram_BusTramBus_4.eachLayer(function(l) {
        if (l.feature.properties['name']) {
            searchIndex.push({ name: l.feature.properties['name'], type: 'Trạm Xe Buýt', layer: l, latlng: l.getLatLng() });
        }
    });
    layer_CatDuonggkpgcat_Duong_1.eachLayer(function(l) {
        if (l.feature.properties['name']) {
            searchIndex.push({ name: l.feature.properties['name'], type: 'Tên Đường', layer: l, latlng: l.getBounds().getCenter() });
        }
    });
}
rebuildSearchIndex();

var searchInput = document.getElementById('searchInput');
var searchResults = document.getElementById('searchResults');

searchInput.addEventListener('input', function() {
    var q = this.value.trim().toLowerCase();
    searchResults.innerHTML = '';
    if (q.length < 2) { searchResults.style.display = 'none'; return; }
    var matches = searchIndex.filter(function(item) { return item.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 8);
    if (matches.length === 0) { searchResults.style.display = 'none'; return; }

    matches.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = '<div>' + item.name + '</div><span style="font-size:10px; color:#64748b;">' + item.type + '</span>';
        div.addEventListener('click', function() {
            if (item.type === 'Trường học' && currentOrigin) {
                drawConnectionLine(currentOrigin.latlng, item.layer);
            } else {
                map.flyTo(item.latlng, 17, { duration: 1.2 });
            }
            if (item.layer.openPopup) setTimeout(function() { item.layer.openPopup(); }, 300);
            searchResults.style.display = 'none';
            searchInput.value = item.name;
        });
        searchResults.appendChild(div);
    });
    searchResults.style.display = 'block';
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-container')) searchResults.style.display = 'none';
});

/* Ô thông báo khi admin chọn tọa độ trường trên bản đồ */
var pickInfo = document.getElementById('pickInfo');

map.on('click', function(e) {
    // Chế độ Admin bấm bản đồ lấy tọa độ thêm trường
    if (isPickingCoord) {
        isPickingCoord = false;
        map.getContainer().style.cursor = '';
        pickInfo.style.display = 'none';
        document.getElementById('schLat').value = e.latlng.lat.toFixed(6);
        document.getElementById('schLng').value = e.latlng.lng.toFixed(6);
        openAdminPage();
        return;
    }
});

/* ---------- TÌM ĐƯỜNG NGẮN NHẤT OSRM & ĐÁNH GIÁ TIẾP CẬN ---------- */
var currentOrigin = null;
var activeWardCenterMarker = null;
var activeConnectionLine = null;
var activeLineMarker = null;
var routeToken = 0;

function clearConnectionLine() {
    routeToken++;
    if (activeConnectionLine) { map.removeLayer(activeConnectionLine); activeConnectionLine = null; }
    if (activeLineMarker) { map.removeLayer(activeLineMarker); activeLineMarker = null; }
}

async function drawConnectionLine(originLatLng, schoolMarker) {
    if (!originLatLng || !schoolMarker) return;
    var schoolLatLng = schoolMarker.getLatLng();
    clearConnectionLine();            // tăng routeToken, huỷ tuyến cũ
    var myToken = routeToken;

    var crowDist = originLatLng.distanceTo(schoolLatLng);
    var group = L.featureGroup();

    L.polyline([originLatLng, schoolLatLng], { color: '#64748b', weight: 3, dashArray: '8, 8', opacity: 0.9 }).addTo(group);

    var roadDist = null;
    var midPt = [(originLatLng.lat + schoolLatLng.lat) / 2, (originLatLng.lng + schoolLatLng.lng) / 2];

    try {
        var ctrl = new AbortController();
        var timer = setTimeout(function() { ctrl.abort(); }, 6000);
        var url = 'https://router.project-osrm.org/route/v1/driving/' +
            originLatLng.lng + ',' + originLatLng.lat + ';' + schoolLatLng.lng + ',' + schoolLatLng.lat +
            '?overview=full&geometries=geojson&alternatives=true';
        var res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        var data = await res.json();

        if (data.routes && data.routes.length > 0) {
            var route = data.routes.reduce(function(a, b) { return b.distance < a.distance ? b : a; });
            roadDist = route.distance;
            var coords = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
            L.polyline(coords, { color: '#2563eb', weight: 5, opacity: 0.9, lineJoin: 'round' }).addTo(group);
            midPt = coords[Math.floor(coords.length / 2)] || midPt;
        }
    } catch (err) { console.warn('Dùng đường chim bay:', err); }

    if (myToken !== routeToken) return;
    group.addTo(map);
    activeConnectionLine = group;

    var labelText = roadDist !== null
        ? '📏 ' + formatDistance(crowDist) + ' (chim bay) · 🚗 ' + formatDistance(roadDist) + ' (đường đi)'
        : '📏 Chim bay: ' + formatDistance(crowDist);

    activeLineMarker = L.marker(midPt, {
        icon: L.divIcon({
            className: 'css_line_label',
            html: '<div style="background:#2563eb; color:#fff; padding:4px 10px; border-radius:12px; font-weight:700; font-size:12px; box-shadow:0 2px 8px rgba(0,0,0,0.35); white-space:nowrap;">' + labelText + '</div>',
            iconSize: [310, 28], iconAnchor: [155, 14]
        }),
        interactive: false
    }).addTo(map);

    map.fitBounds(group.getBounds(), { padding: [60, 60], animate: true });
}

function formatDistance(meters) {
    return meters >= 1000 ? (meters / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(meters) + ' m';
}

function setOrigin(newOrigin, keepExistingLine) {
    if (!keepExistingLine) clearConnectionLine();
    currentOrigin = newOrigin;

    if (activeWardCenterMarker) { map.removeLayer(activeWardCenterMarker); activeWardCenterMarker = null; }

    if (!currentOrigin) {
        layer_TruongHoctruonghoc_nhatrang_5.eachLayer(function(marker) {
            var el = marker.getElement();
            if (el) { el.style.filter = ''; el.style.opacity = '1'; }
        });
        applySchoolLabels();
        resetLabels(labelLayers);
        return;
    }

    if (!currentOrigin.isGPS) {
        activeWardCenterMarker = L.marker(currentOrigin.latlng, {
            icon: L.divIcon({
                className: 'css_ward_center_icon',
                html: '<div style="width:26px; height:26px; background:#ef4444; border:3px solid #ffffff; border-radius:50%; box-shadow:0 2px 8px rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:11px;"><i class="fas fa-crosshairs"></i></div>',
                iconSize: [26, 26], iconAnchor: [13, 13]
            }),
            zIndexOffset: 1000
        }).addTo(map);
        activeWardCenterMarker.bindTooltip('<div><b>📍 Tâm Phường / Xã ' + currentOrigin.wardName + '</b></div>', { direction: 'top', offset: [0, -14] });
    }

    layer_TruongHoctruonghoc_nhatrang_5.eachLayer(function(marker) {
        var a = accessInfo(marker), el = marker.getElement();
        if (el) { el.style.filter = a.filter; el.style.opacity = a.opacity; }
        marker.bindTooltip('<div><b>' + (marker.feature.properties['name'] || 'Trường học') + '</b><br/>Cách ' + currentOrigin.label +
            ': <b style="color:' + a.color + ';">' + formatDistance(a.dist) + '</b></div>', { direction: 'top', offset: [0, -15] });
    });
}

wardSelect.addEventListener('change', function() {
    if (currentOrigin && currentOrigin.isGPS) locateControl.stop();
    var selectedWardName = this.value;
    if (!selectedWardName) { map.fitBounds(layer_NhaTrang_KetQua_0.getBounds()); setOrigin(null); return; }
    layer_NhaTrang_KetQua_0.eachLayer(function(l) {
        if (l.feature.properties['NAME_3'] === selectedWardName) {
            map.fitBounds(l.getBounds(), { padding: [40, 40] });
            l.openPopup();
            setOrigin({ latlng: l.getBounds().getCenter(), label: 'trung tâm ' + selectedWardName, wardName: selectedWardName, isGPS: false });
        }
    });
});

layer_NhaTrang_KetQua_0.eachLayer(function(l) {
    l.on('click', function() {
        if (isPickingCoord) return;
        if (currentOrigin && currentOrigin.isGPS) locateControl.stop();
        var wardName = l.feature.properties['NAME_3'];
        if (wardName) {
            wardSelect.value = wardName;
            setOrigin({ latlng: l.getBounds().getCenter(), label: 'trung tâm ' + wardName, wardName: wardName, isGPS: false });
        }
    });
});

/* ---------- ĐỊNH VỊ GPS ---------- */
function isPointInPolyCoords(pt, polyCoords) {
    var x = pt.lng, y = pt.lat, inside = false;
    for (var i = 0, j = polyCoords.length - 1; i < polyCoords.length; j = i++) {
        var xi = polyCoords[i][0], yi = polyCoords[i][1], xj = polyCoords[j][0], yj = polyCoords[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xi - xj) * (y - yj) / (yi - yj) + xj)) inside = !inside;
    }
    return inside;
}

function isPointInWard(latlng, feature) {
    var geom = feature.geometry;
    if (geom.type === 'Polygon') return isPointInPolyCoords(latlng, geom.coordinates[0]);
    if (geom.type === 'MultiPolygon') {
        for (var i = 0; i < geom.coordinates.length; i++) if (isPointInPolyCoords(latlng, geom.coordinates[i][0])) return true;
    }
    return false;
}

map.on('locationfound', function(e) {
    var userLatLng = e.latlng, foundWardName = '';
    layer_NhaTrang_KetQua_0.eachLayer(function(l) {
        if (isPointInWard(userLatLng, l.feature)) foundWardName = l.feature.properties['NAME_3'] || '';
    });
    wardSelect.value = foundWardName;
    var isAlreadyGPS = (currentOrigin && currentOrigin.isGPS);
    setOrigin({ latlng: userLatLng, label: 'vị trí hiện tại của bạn', wardName: foundWardName, isGPS: true }, isAlreadyGPS);
});

map.on('locationstop', function() {
    if (currentOrigin && currentOrigin.isGPS) { wardSelect.value = ''; setOrigin(null); }
});

/* ==========================================================================
   QUẢN LÝ 3 MÀN HÌNH (ĐĂNG NHẬP - BẢN ĐỒ - QUẢN TRỊ) & SUPABASE
   ========================================================================== */
function openModal(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}
function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

var helpBtnEl = document.getElementById('helpBtn');
if (helpBtnEl) {
    helpBtnEl.addEventListener('click', function() { openModal('helpModal'); });
}

function esc(s) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return map[c]; });
}

function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast' + (/^(Lỗi|Chưa cấu hình|Vui lòng)/.test(msg) ? ' err' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 3500);
}

function setLoginMode(regMode) {
    isRegisterMode = regMode;
    var authMsg = document.getElementById('authMsg');
    var tabLogin = document.getElementById('tabLoginMode');
    var tabReg = document.getElementById('tabRegisterMode');
    var fullNameGroup = document.getElementById('fullNameGroup');
    var submitBtn = document.getElementById('authSubmitBtn');
    var passwordInput = document.getElementById('authPassword');
    var confirmGroup = document.getElementById('confirmGroup');

    if (authMsg) authMsg.textContent = '';
    if (tabLogin) tabLogin.classList.toggle('active', !regMode);
    if (tabReg) tabReg.classList.toggle('active', regMode);
    if (fullNameGroup) fullNameGroup.style.display = regMode ? 'block' : 'none';
    if (submitBtn) submitBtn.textContent = regMode ? 'Tạo tài khoản' : 'Đăng nhập';
    if (passwordInput) passwordInput.autocomplete = regMode ? 'new-password' : 'current-password';
    if (confirmGroup) confirmGroup.style.display = regMode ? 'block' : 'none';
}

function showLoginPage() {
    var adminPage = document.getElementById('adminPage');
    var loginPage = document.getElementById('loginPage');
    if (adminPage) adminPage.style.display = 'none';
    if (loginPage) loginPage.style.display = 'flex';
}

function hideLoginPageToMap() {
    var loginPage = document.getElementById('loginPage');
    if (loginPage) loginPage.style.display = 'none';
    setTimeout(function() { map.invalidateSize(); }, 150);
}

function enterMapAsGuest() {
    currentUser = null;
    currentProfile = null;
    renderMapAuthBar();
    hideLoginPageToMap();
}

async function submitAuthForm() {
    if (!isSupabaseConfigured) {
        toast('Chưa cấu hình SUPABASE_URL và SUPABASE_ANON_KEY.');
        return;
    }
    var emailEl = document.getElementById('authEmail');
    var passEl = document.getElementById('authPassword');
    var fullNameEl = document.getElementById('authFullName');
    var confirmEl = document.getElementById('authPasswordConfirm');
    var msgEl = document.getElementById('authMsg');
    var btn = document.getElementById('authSubmitBtn');

    var email = emailEl ? emailEl.value.trim() : '';
    var password = passEl ? passEl.value : '';
    var fullName = fullNameEl ? fullNameEl.value.trim() : '';
    var confirmPass = confirmEl ? confirmEl.value : '';

    if (!email || password.length < 6) {
        if (msgEl) msgEl.textContent = 'Vui lòng nhập email hợp lệ và mật khẩu từ 6 ký tự.';
        return;
    }
    if (isRegisterMode && password !== confirmPass) {
        if (msgEl) msgEl.textContent = 'Mật khẩu xác nhận không khớp.';
        return;
    }
    if (msgEl) msgEl.textContent = '';
    if (btn) btn.disabled = true;

    var res;
    try {
        res = isRegisterMode
            ? await sb.auth.signUp({
                email: email,
                password: password,
                options: { data: { full_name: fullName || email.split('@')[0] } }
            })
            : await sb.auth.signInWithPassword({ email: email, password: password });
    } catch (err) {
        if (msgEl) msgEl.textContent = 'Lỗi kết nối: ' + (err.message || err);
        return;
    } finally {
        if (btn) btn.disabled = false;
    }

    if (res.error) {
        if (msgEl) msgEl.textContent = (isRegisterMode ? 'Lỗi đăng ký: ' : 'Sai email hoặc mật khẩu: ') + res.error.message;
        return;
    }
    await checkUserSession();
    hideLoginPageToMap();
}

function renderMapAuthBar() {
    var authArea = document.getElementById('authArea');
    if (!authArea) return;
    if (!currentUser || !currentProfile) {
        authArea.innerHTML = '<button class="action-btn primary" onclick="showLoginPage()">' +
            '<i class="fas fa-sign-in-alt"></i> <span>Đăng nhập / Đăng ký</span></button>';
        return;
    }
    var html = '<button class="action-btn" onclick="openProfileModal()">' +
        '<i class="fas fa-user"></i> ' +
        '<span>' + esc(currentProfile.full_name || currentProfile.email) + ' (' + currentProfile.role.toUpperCase() + ')</span></button>';
    if (currentProfile.role === 'admin') {
        html += '<button class="action-btn admin" onclick="openAdminPage()"><i class="fas fa-cogs"></i> <span>Trang Quản trị</span></button>';
    }
    authArea.innerHTML = html + '<button class="action-btn logout" onclick="logoutUser()"><i class="fas fa-sign-out-alt"></i> <span>Đăng xuất</span></button>';
}

async function checkUserSession() {
    if (!sb) return false;
    var { data } = await sb.auth.getSession();
    currentUser = data.session ? data.session.user : null;

    if (!currentUser) {
        currentProfile = null;
        renderMapAuthBar();
        return false;
    }

    var { data: prof } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = prof || { email: currentUser.email, full_name: currentUser.email, role: 'user' };
    renderMapAuthBar();
    return true;
}

function openProfileModal() {
    document.getElementById('profEmail').value = currentProfile.email;
    document.getElementById('profRole').value = currentProfile.role === 'admin' ? 'Quản trị viên (Admin)' : 'Người dùng (User)';
    document.getElementById('profFullName').value = currentProfile.full_name || '';
    openModal('profileModal');
}

async function saveMyProfile() {
    var newName = document.getElementById('profFullName').value.trim();
    var { error } = await sb.from('profiles').update({ full_name: newName }).eq('id', currentUser.id);
    if (error) { toast('Lỗi cập nhật: ' + error.message); return; }
    toast('Đã cập nhật hồ sơ!');
    closeModal('profileModal');
    await checkUserSession();
}

async function logoutUser() {
    if (sb) await sb.auth.signOut();
    currentUser = null;
    currentProfile = null;
    closeModal('profileModal');
    renderMapAuthBar();
    showLoginPage();
}

/* ---------- ĐỒNG BỘ DỮ LIỆU TRƯỜNG HỌC TỪ SUPABASE ---------- */
var cloudLoadError = '';
async function loadSchoolsFromCloud() {
    if (!sb) return;
    var { data, error } = await sb.from('truong_hoc').select('*').order('id', { ascending: true });
    if (error) { cloudLoadError = error.message; console.warn('Chưa tải được bảng truong_hoc:', error.message); return; }
    cloudLoadError = '';

    cloudSchools = data || [];
    if (cloudSchools.length > 0) {
        var geojsonFeatures = cloudSchools.map(function(row) {
            return {
                type: 'Feature',
                properties: { id: row.id, name: row.name, CapHoc: row.cap_hoc, LoaiHinh: row.loai_hinh, created_at: row.created_at, updated_at: row.updated_at },
                geometry: { type: 'Point', coordinates: [row.lng, row.lat] }
            };
        });
        layer_TruongHoctruonghoc_nhatrang_5.clearLayers();
        layer_TruongHoctruonghoc_nhatrang_5.addData({ type: 'FeatureCollection', features: geojsonFeatures });
        applySchoolLabels();
        resetLabels(labelLayers);
        updateSchoolIconSizes();
        applySchoolTypeFilter();
        rebuildSearchIndex();
        if (currentOrigin) setOrigin(currentOrigin, true);
    }
}

async function syncInitialSchoolsToCloud(silent) {
    if (!silent && !confirm('Đẩy toàn bộ danh sách trường học từ file dữ liệu gốc lên Supabase?')) return false;
    var { error } = await sb.from('truong_hoc').insert(localSchoolRows().map(function(r) {
        return { name: r.name, cap_hoc: r.cap_hoc, loai_hinh: r.loai_hinh, lng: r.lng, lat: r.lat };
    }));
    if (error) { toast('Lỗi đồng bộ: ' + error.message); return false; }
    await loadSchoolsFromCloud();
    renderAdminSchoolTable();
    toast('Đã nạp ' + cloudSchools.length + ' trường học lên Cloud.');
    return true;
}

/* Dữ liệu gốc từ file, dùng khi bảng trên Cloud còn trống */
function localSchoolRows() {
    return json_TruongHoctruonghoc_nhatrang_5.features.map(function(f, i) {
        return { _i: i, name: f.properties['name'] || 'Trường học', cap_hoc: f.properties['CapHoc'] || 'Tiểu học',
                 loai_hinh: 'Công lập', lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
    });
}

/* ---------- TRANG QUẢN TRỊ RIÊNG (ADMIN PAGE) ---------- */
async function openAdminPage() {
    var adminPage = document.getElementById('adminPage');
    if (adminPage) adminPage.style.display = 'block';
    fillSchoolSelects();
    await loadSchoolsFromCloud();
    renderAdminSchoolTable();
}

function closeAdminPage() {
    var adminPage = document.getElementById('adminPage');
    if (adminPage) adminPage.style.display = 'none';
    setTimeout(function() { map.invalidateSize(); }, 150);
}

function applyPastedCoords() {
    var m = document.getElementById('geoPaste').value.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
    if (!m) return;
    var a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) { var t = a; a = b; b = t; }
    if (Math.abs(a) > 90 || Math.abs(b) > 180) { toast('Lỗi: tọa độ không hợp lệ.'); return; }
    document.getElementById('schLat').value = a.toFixed(6);
    document.getElementById('schLng').value = b.toFixed(6);
    toast('Đã điền tọa độ: ' + a.toFixed(6) + ', ' + b.toFixed(6));
}

function startPickSchoolOnMap() {
    closeAdminPage();
    isPickingCoord = true;
    map.getContainer().style.cursor = 'crosshair';
    if (pickInfo) {
        pickInfo.style.display = 'block';
        pickInfo.innerHTML = 'Bấm vào vị trí trường học trên bản đồ để lấy tọa độ';
    }
}

function resetSchoolForm() {
    ['editSchoolId', 'schName', 'schLat', 'schLng'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    var pasteEl = document.getElementById('geoPaste');
    if (pasteEl) pasteEl.value = '';
    var headerEl = document.getElementById('schoolFormHeader');
    if (headerEl) headerEl.textContent = 'Thêm trường học';
}

function editSchoolRow(id) {
    var s = cloudSchools.find(function(item) { return item.id === id; });
    if (!s) return;
    document.getElementById('editSchoolId').value = s.id;
    document.getElementById('schName').value = s.name;
    document.getElementById('schCapHoc').value = s.cap_hoc;
    document.getElementById('schLoaiHinh').value = s.loai_hinh || 'Công lập';
    document.getElementById('schLat').value = s.lat;
    document.getElementById('schLng').value = s.lng;
    document.getElementById('schoolFormHeader').textContent = 'Chỉnh sửa: ' + s.name;
    var mainEl = document.querySelector('.admin-main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('schName').focus();
}

async function saveSchool() {
    var id = document.getElementById('editSchoolId').value;
    var payload = {
        name: document.getElementById('schName').value.trim(),
        cap_hoc: document.getElementById('schCapHoc').value,
        loai_hinh: document.getElementById('schLoaiHinh').value,
        lat: parseFloat(document.getElementById('schLat').value),
        lng: parseFloat(document.getElementById('schLng').value)
    };
    if (!payload.name || isNaN(payload.lat) || isNaN(payload.lng)) {
        toast('Vui lòng nhập đầy đủ Tên trường và Tọa độ hợp lệ.');
        return;
    }
    var res = id
        ? await sb.from('truong_hoc').update(payload).eq('id', id).select().single()
        : await sb.from('truong_hoc').insert([payload]).select().single();
    if (res.error) { toast('Lỗi lưu dữ liệu: ' + res.error.message); return; }

    resetSchoolForm();
    await loadSchoolsFromCloud();
    renderAdminSchoolTable();
    toast('Đã lưu thông tin trường học.');
}

async function deleteSchoolRow(id, name) {
    name = name || (cloudSchools.find(function(s) { return s.id === id; }) || {}).name || '';
    if (!confirm('Xóa trường "' + name + '" khỏi cơ sở dữ liệu?')) return;
    var { error } = await sb.from('truong_hoc').delete().eq('id', id);
    if (error) { toast('Lỗi xóa: ' + error.message); return; }
    await loadSchoolsFromCloud();
    renderAdminSchoolTable();
}

function renderAdminSchoolTable() {
    var searchAdmin = document.getElementById('adminSearchSchool');
    var q = (searchAdmin ? searchAdmin.value : '').toLowerCase();
    var tbody = document.getElementById('adminSchoolTableBody');
    if (!tbody) return;
    var list = cloudSchools.filter(function(s) { return s.name.toLowerCase().indexOf(q) !== -1; });

    var syncBtn = document.getElementById('syncInitialBtn');
    if (syncBtn) syncBtn.style.display = cloudSchools.length ? 'none' : 'inline-block';

    if (list.length === 0) {
        var msg = cloudLoadError ? 'Không đọc được bảng truong_hoc: ' + esc(cloudLoadError) : 'Chưa có trường nào. Bấm "Nạp dữ liệu gốc lên Cloud" hoặc thêm trường mới.';
        tbody.innerHTML = '<tr><td colspan="5" class="empty">' + msg + '</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(function(s) {
        return '<tr><td><b>' + esc(s.name) + '</b></td>' +
            '<td>' + esc(s.cap_hoc) + '</td><td>' + esc(s.loai_hinh || 'Công lập') + '</td>' +
            '<td>' + s.lat.toFixed(4) + ', ' + s.lng.toFixed(4) + '</td>' +
            '<td class="actions"><button class="btn-sm btn-gray" onclick="editSchoolRow(' + s.id + ')">Sửa</button>' +
            '<button class="btn-sm btn-red" onclick="deleteSchoolRow(' + s.id + ')">Xóa</button></td></tr>';
    }).join('');
}

/* Danh mục cấp học / loại hình để cố định trong code (không dùng bảng riêng) */
var CAP_HOC_LIST = ['Mầm non / Mẫu giáo', 'Tiểu học', 'THCS', 'THPT', 'Đại học / Cao đẳng'];
var LOAI_HINH_LIST = ['Công lập', 'Tư thục / Dân lập'];
function fillSchoolSelects() {
    function opts(list) { return list.map(function(v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join(''); }
    var capEl = document.getElementById('schCapHoc');
    var loaiEl = document.getElementById('schLoaiHinh');
    if (capEl) capEl.innerHTML = opts(CAP_HOC_LIST);
    if (loaiEl) loaiEl.innerHTML = opts(LOAI_HINH_LIST);
}

/* ---------- KHỞI CHẠY KHI MỞ TRANG ---------- */
(async function initApp() {
    if (!isSupabaseConfigured) return;
    var hasSession = await checkUserSession();
    if (hasSession) {
        hideLoginPageToMap();
    } else {
        showLoginPage();
    }
    await loadSchoolsFromCloud();
})();

/* ---------- GIAO DIỆN ĐIỆN THOẠI: thu gọn bảng lớp (phần CSS nằm trong css/style.css) ---------- */
window.addEventListener('load', function() {
    if (window.innerWidth > 768) return;
    var layerControl = document.querySelector('.leaflet-control-layers');
    if (layerControl) layerControl.classList.remove('leaflet-control-layers-expanded');
});
