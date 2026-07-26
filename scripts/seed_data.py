#!/usr/bin/env python3
"""
Seed realistic data into the Coffee Export ERP database.
Adds: 6 lots, 5 sample requests, 3 shipments, 16 compliance documents.
"""
import sqlite3
import json
from datetime import datetime, timedelta

DB = "/home/z/my-project/coffee_export/data/coffee_export.db"
now = datetime.now().isoformat() + "+03:00"

conn = sqlite3.connect(DB)
c = conn.cursor()

# ═══ 1. SEED LOTS (6 more, total 8) ═══
existing_lots = c.execute("SELECT COUNT(*) FROM lots WHERE deleted_ts IS NULL").fetchone()[0]
print(f"Existing lots: {existing_lots}")

if existing_lots < 8:
    # Get next lot number and station/coop IDs
    last_lot = c.execute("SELECT lot_id FROM lots ORDER BY lot_id DESC LIMIT 1").fetchone()
    next_num = int(last_lot[0].split("-")[-1]) + 1 if last_lot else 1

    lots_to_add = [
        # region, station_name, coop_name, process, screen, score, crop_year, stock, certs, eudr_status, lat, lon, price
        ("Yirgacheffe", "Idido Station", "Yirgacheffe Union", "Natural", 14, 88.2, "25/26", 30, "organic", "complete", 6.1750, 38.2100, 29.0),
        ("Sidamo", "Bensa Station", "Bensa Co-op", "Washed", 14, 84.5, "25/26", 80, "", "complete", 6.3500, 38.4500, 26.0),
        ("Sidamo", "Bensa Station", "Bensa Co-op", "Natural", 13, 83.0, "25/26", 0, "", "missing", None, None, None),
        ("Limu", "Limu Station", "Limu Co-op", "Washed", 14, 82.0, "25/26", 50, "", "partial", 8.1500, 37.2800, 25.0),
        ("Harrar", "Harrar Station", "Harrar Co-op", "Natural", 15, 84.0, "25/26", 25, "", "missing", None, None, None),
        ("Guji", "Shakisso Station", "Shakisso Co-op", "Natural", 14, 85.5, "25/26", 35, "organic;FT", "complete", 5.9847, 38.2856, 28.0),
    ]

    for region, station, coop, process, screen, score, crop, stock, certs, eudr, lat, lon, price in lots_to_add:
        lot_id = f"LOT-25-{next_num:04d}"
        next_num += 1

        # Create or find coop
        coop_row = c.execute("SELECT coop_id FROM coops WHERE name=? AND region=?", (coop, region)).fetchone()
        if coop_row:
            coop_id = coop_row[0]
        else:
            coop_id = f"COOP-{c.execute('SELECT COUNT(*) FROM coops').fetchone()[0] + 1:04d}"
            c.execute("INSERT INTO coops (coop_id, name, region, created_ts, updated_ts) VALUES (?,?,?,?,?)", (coop_id, coop, region, now, now))

        # Create or find station
        station_row = c.execute("SELECT station_id FROM washing_stations WHERE name=? AND region=?", (station, region)).fetchone()
        if station_row:
            station_id = station_row[0]
        else:
            station_id = f"WS-{c.execute('SELECT COUNT(*) FROM washing_stations').fetchone()[0] + 1:04d}"
            c.execute("INSERT INTO washing_stations (station_id, coop_id, name, region, gps_lat, gps_lon, created_ts, updated_ts) VALUES (?,?,?,?,?,?,?,?)",
                      (station_id, coop_id, station, region, lat, lon, now, now))
        # Insert lot
        c.execute("""
            INSERT INTO lots (lot_id, station_id, coop_id, region, washing_station_name, coop_name,
                process, screen_size, cupping_score, crop_year, stock_bags_remaining, bag_size_kg,
                certifications, eudr_data_status, eudr_gps_lat, eudr_gps_lon, eudr_farmgate_price_etb_per_kg,
                status, last_updated_ts, created_ts, updated_ts, deleted_ts)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NULL)
        """, (lot_id, station_id, coop_id, region, station, coop, process, screen, score, crop,
              stock, 60, certs, eudr, lat, lon, price, "active" if stock > 0 else "depleted", now, now, now))
        print(f"  ✓ {lot_id}: {region} {process} score={score} stock={stock}")

# ═══ 2. SEED SAMPLE REQUESTS (5) ═══
existing_samples = c.execute("SELECT COUNT(*) FROM sample_requests").fetchone()[0]
print(f"\nExisting samples: {existing_samples}")

if existing_samples == 0:
    # Get some leads to attach samples to
    leads = c.execute("SELECT lead_id, company_name, headquarters_country FROM leads WHERE current_state IN ('SAMPLE_DISPATCHED','SAMPLE_FEEDBACK_DUE','DECIDED_APPROVED','DECIDED_REJECTED','IN_SEQUENCE','QUALIFIED') LIMIT 5").fetchall()
    lots = c.execute("SELECT lot_id, region, process FROM lots WHERE deleted_ts IS NULL AND stock_bags_remaining > 0 LIMIT 5").fetchall()

    sample_data = [
        ("SR-2026-0001", leads[0][0] if leads else "L-2026-00002", leads[0][1] if leads else "Test Buyer", "350g", "dispatched", "2026-07-10", None, leads[0][2] if leads else "Germany"),
        ("SR-2026-0002", leads[1][0] if len(leads) > 1 else "L-2026-00003", leads[1][1] if len(leads) > 1 else "Test Buyer 2", "350g", "delivered", "2026-07-05", "2026-07-09", leads[1][2] if len(leads) > 1 else "Germany"),
        ("SR-2026-0003", leads[2][0] if len(leads) > 2 else "L-2026-00001", leads[2][1] if len(leads) > 2 else "Test Buyer 3", "150g", "draft", None, None, leads[2][2] if len(leads) > 2 else "UK"),
        ("SR-2026-0004", leads[3][0] if len(leads) > 3 else "L-2026-00006", leads[3][1] if len(leads) > 3 else "Test Buyer 4", "350g", "decided", "2026-06-20", "2026-06-25", leads[3][2] if len(leads) > 3 else "Germany"),
        ("SR-2026-0005", leads[4][0] if len(leads) > 4 else "L-2026-00009", leads[4][1] if len(leads) > 4 else "Test Buyer 5", "350g", "feedback_due", "2026-07-01", "2026-07-05", leads[4][2] if len(leads) > 4 else "Germany"),
    ]

    for sr_id, lead_id, company, stype, status, dispatched, delivered, country in sample_data:
        c.execute("""
            INSERT INTO sample_requests (sample_request_id, lead_id, sample_type, crop_year,
                buyer_company, buyer_destination_country, buyer_language,
                shipping_arrangement, status, dispatched_ts, delivered_ts,
                substitute_round, created_ts, updated_ts)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (sr_id, lead_id, stype, "25/26", company, country, "EN",
              "pre_paid", status, dispatched, delivered, 0, now, now))

        # Add lot links
        if lots:
            lot = lots[hash(sr_id) % len(lots)]
            c.execute("""
                INSERT INTO sample_request_lots (sample_request_id, lot_id, quantity_grams, confirmed)
                VALUES (?,?,?,?)
            """, (sr_id, lot[0], 350 if stype == "350g" else 150, 1))

        print(f"  ✓ {sr_id}: {company} | {status} | lot={lot[0] if lots else 'none'}")

    # Add a cupping score for the delivered sample
    c.execute("""
        INSERT INTO cupping_scores (sample_request_id, lot_id, buyer_company, cupper_name,
            fragrance_aroma, flavor, aftertaste, acidity, body, balance,
            uniformity, clean_cup, sweetness, overall, total_score, buyer_notes,
            cupped_ts, received_ts, created_ts, updated_ts)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, ("SR-2026-0002", lots[0][0] if lots else "LOT-25-0001", sample_data[1][2],
          "Marcus Bauer", 7.5, 7.5, 7.0, 7.5, 7.0, 7.0, 8.0, 8.0, 8.0, 7.5, 87.5,
          "Excellent Yirgacheffe. Bright acidity, floral notes.", "2026-07-14", "2026-07-14", now, now))
    print(f"  ✓ Cupping score added: 87.5 for SR-2026-0002")

    # Add a decision for the decided sample
    c.execute("""
        INSERT INTO sample_decisions (decision_id, sample_request_id, lot_id, decision, decision_ts, notes, created_ts, updated_ts)
        VALUES (?,?,?,?,?,?,?,?)
    """, ("DEC-001", "SR-2026-0004", lots[0][0] if lots else "LOT-25-0001", "approved", now, "All lots approved. Proceeding to contract.", now, now))
    print(f"  ✓ Decision added: approved for SR-2026-0004")

# ═══ 3. SEED SHIPMENTS (3) ═══
existing_shipments = c.execute("SELECT COUNT(*) FROM shipments").fetchone()[0]
print(f"\nExisting shipments: {existing_shipments}")

if existing_shipments == 0:
    contracts = c.execute("SELECT contract_id, total_volume_bags FROM contracts WHERE deleted_ts IS NULL LIMIT 3").fetchall()

    shipments_data = [
        ("SHP-2026-001", contracts[0][0] if contracts else "CT-2026-0001", "MSC", "MSC Hamburg",
         "MSCU-7729340", "MAEU-882991", "Djibouti", "Hamburg", "2026-07-19", "2026-08-09",
         "in_transit", contracts[0][1] if contracts else 100),
        ("SHP-2026-002", contracts[1][0] if len(contracts) > 1 else "CT-2026-0002", "CMA CGM", "CMA CGM Antoine",
         "CMAU-8834210", "CMA-2026-441", "Djibouti", "Antwerp", "2026-07-24", "2026-08-18",
         "departed", contracts[1][1] if len(contracts) > 1 else 50),
        ("SHP-2026-003", contracts[0][0] if contracts else "CT-2026-0001", "Hapag-Lloyd", "Hapag-Lloyd Berlin",
         "HLCU-8821047", "HL-2026-889", "Djibouti", "Hamburg", "2026-06-18", "2026-07-09",
         "delivered", 80),
    ]

    for sid, cid, carrier, vessel, container, bl, dep, arr, etd, eta, status, bags in shipments_data:
        c.execute("""
            INSERT INTO shipments (shipment_id, contract_id, carrier, vessel_name,
                bill_of_lading_number, container_number,
                departure_port, arrival_port, etd, eta,
                status, created_ts, updated_ts)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (sid, cid, carrier, vessel, bl, container, dep, arr, etd, eta, status, now, now))

        # Add shipment items (link to a lot)
        lot = c.execute("SELECT lot_id FROM lots WHERE deleted_ts IS NULL LIMIT 1").fetchone()
        if lot:
            c.execute("""
                INSERT INTO shipment_items (shipment_id, lot_id, quantity_bags, created_ts, updated_ts)
                VALUES (?,?,?,?,?)
            """, (sid, lot[0], bags, now, now))

        print(f"  ✓ {sid}: {vessel} | {dep}→{arr} | status={status}")

# ═══ 4. SEED COMPLIANCE DOCUMENTS (8 types per contract) ═══
existing_docs = c.execute("SELECT COUNT(*) FROM compliance_documents").fetchone()[0]
print(f"\nExisting compliance docs: {existing_docs}")

if existing_docs == 0:
    contracts = c.execute("SELECT contract_id FROM contracts WHERE deleted_ts IS NULL").fetchall()

    doc_types = [
        ("phytosanitary_cert", "approved", "2026-05-30", "2026-07-30"),
        ("certificate_of_origin", "approved", "2026-07-15", "2027-01-12"),
        ("commercial_invoice", "approved", "2026-07-15", None),
        ("packing_list", "approved", "2026-07-15", None),
        ("bill_of_lading", "approved", "2026-07-22", None),
        ("insurance_cert", "approved", "2026-07-18", "2026-08-17"),
        ("eudr_attestation", "approved", "2026-07-15", "2027-07-15"),
        ("organic_cert", "approved", "2026-06-01", "2026-12-01"),
    ]

    for contract in contracts:
        cid = contract[0]
        for doc_type, status, issued, expiry in doc_types:
            c.execute("""
                INSERT INTO compliance_documents (contract_id, document_type, file_path,
                    issued_date, expiry_date, status, notes, created_ts, updated_ts)
                VALUES (?,?,?,?,?,?,?,?,?)
            """, (cid, doc_type, f"docs/{cid}_{doc_type}.pdf", issued, expiry, status,
                  f"Document {doc_type} for {cid}", now, now))
        print(f"  ✓ {cid}: 8 compliance documents added")

conn.commit()

# Verify counts
print("\n=== Final counts ===")
for table in ['lots', 'sample_requests', 'shipments', 'compliance_documents', 'cupping_scores', 'sample_decisions']:
    count = c.execute(f"SELECT COUNT(*) FROM {table} WHERE deleted_ts IS NULL" if table in ['lots','shipments','compliance_documents'] else f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table}: {count}")

conn.close()
print("\n✅ Seeding complete!")
