import json

def dms_to_dd(d, m, s, direction):
    dd = d + m/60 + s/3600
    if direction in ['S', 'W']:
        dd *= -1
    return round(dd, 6)

# OBBB (Bahrain FIR) - New limited boundary
obbb_coords = [
    [49.666666, 28.733333], # 28°44'00"N 049°40'00"E
    [50.916667, 27.083333], # 27°05'00"N 050°55'00"E
    [51.166667, 26.916667], # 26°55'00"N 051°10'00"E
    [51.733056, 26.744444], # 26°44'40"N 051°43'59"E
    [51.646944, 26.232222], # 26°13'56"N 051°38'49"E
    [51.383611, 26.359444], # 26°21'34"N 051°23'01"E
    [51.205556, 26.394444], # 26°23'40"N 051°12'20"E
    [51.072222, 26.354722], # 26°21'17"N 051°04'20"E
    [51.004444, 26.269167], # 26°16'09"N 051°00'16"E
    [50.920278, 26.225],    # 26°13'30"N 050°55'13"E
    [50.9175, 26.183889],   # 26°11'02"N 050°55'03"E
    [49.666666, 28.733333]
]

# OTDF (Doha FIR) - Points
otdf_coords = [
    [52.962222, 25.633611], # 25°38'01"N 052°57'44"E
    [52.515, 25.04],        # 25°02'24"N 052°30'54"E
    [52.310278, 24.999722], # 24°59'59"N 052°18'37"E
    [52.370833, 24.846111], # 24°50'46"N 052°22'15"E
    [52.0, 24.816667],      # 24°49'00"N 052°00'00"E
    [51.572778, 24.713056], # 24°42'47"N 051°34'22"E
    [51.435556, 24.638056], # 24°38'17"N 051°26'08"E
    [51.405833, 24.629722], # 24°37'47"N 051°24'21"E
    [51.401667, 24.625278], # 24°37'31"N 051°24'06"E
    [50.9175, 26.183889],   # 26°11'02"N 050°55'03"E
    [50.920278, 26.225],    # 26°13'30"N 050°55'13"E
    [51.004444, 26.269167], # 26°16'09"N 051°00'16"E
    [51.072222, 26.354722], # 26°21'17"N 051°04'20"E
    [51.205556, 26.394444], # 26°23'40"N 051°12'20"E
    [51.383611, 26.359444], # 26°21'34"N 051°23'01"E
    [51.646944, 26.232222], # 26°13'56"N 051°38'49"E
    [52.962222, 25.633611]
]

def create_feature(icao, name, coords, cartodb_id, fid):
    return {
        "type": "Feature",
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [[[coords]]]
        },
        "properties": {
            "cartodb_id": cartodb_id,
            "fid": fid,
            "supp_regio": " ",
            "remarks3": " ",
            "remarks2": " ",
            "remarks": "Updated FIR delineation",
            "historic": " ",
            "nom_comp": name,
            "resp": "CAIRO",
            "icaocode": icao,
            "ulc": "LC",
            "lower": "L",
            "upper": " ",
            "kind": "FIR",
            "region": "MID",
            "firname": f"FIR {name}",
            "perimekm": 0,
            "areasqkm": 0,
            "centlat": 0,
            "centlong": 0
        }
    }

obbb_feature = create_feature("OBBB", "BAHRAIN", obbb_coords, 320, 319)
otdf_feature = create_feature("OTDF", "DOHA", otdf_coords, 999, 998) # Arbitrary high IDs

print("OBBB Feature:")
print(json.dumps(obbb_feature, indent=4))
print("\nOTDF Feature:")
print(json.dumps(otdf_feature, indent=4))
