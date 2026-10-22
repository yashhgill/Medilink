-- MediLink — cloud node schema (PostgreSQL).
--
-- Generated from the application's own SQLAlchemy metadata, so it is exactly
-- what the app expects. Run this FIRST, then 001_rls_multitenancy.sql.
--
-- Safe to re-run: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS appointments (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	doctor_id VARCHAR, 
	scheduled_at VARCHAR, 
	reason VARCHAR, 
	fee FLOAT, 
	status VARCHAR, 
	queue_number INTEGER, 
	payment_status VARCHAR, 
	payment_method VARCHAR, 
	payment_ref VARCHAR, 
	paid_amount FLOAT, 
	is_block BOOLEAN, 
	triage_colour VARCHAR, 
	triage_category VARCHAR, 
	triage_target_mins INTEGER, 
	duration_minutes INTEGER, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	created_by VARCHAR, 
	dispensed_at VARCHAR, 
	dispensed_by VARCHAR, 
	facility_id VARCHAR, 
	source VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS attachments (
	id VARCHAR NOT NULL, 
	record_id VARCHAR, 
	patient_id VARCHAR, 
	filename VARCHAR, 
	content_type VARCHAR, 
	size_bytes INTEGER, 
	path VARCHAR, 
	uploaded_by VARCHAR, 
	created_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
	id VARCHAR NOT NULL, 
	user_id VARCHAR, 
	user_role VARCHAR, 
	action VARCHAR, 
	resource VARCHAR, 
	resource_id VARCHAR, 
	facility_id VARCHAR, 
	ip_address VARCHAR, 
	timestamp VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS counters (
	key VARCHAR NOT NULL, 
	value INTEGER, 
	PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS dispense_records (
	id VARCHAR NOT NULL, 
	appointment_id VARCHAR, 
	patient_id VARCHAR, 
	pharmacist_id VARCHAR, 
	items JSON, 
	total_cost FLOAT, 
	dispensed_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS facilities (
	id VARCHAR NOT NULL, 
	code VARCHAR, 
	name VARCHAR, 
	type VARCHAR, 
	address VARCHAR, 
	phone VARCHAR, 
	active BOOLEAN, 
	created_at VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS lab_orders (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	doctor_id VARCHAR, 
	record_id VARCHAR, 
	test_name VARCHAR, 
	test_code VARCHAR, 
	status VARCHAR, 
	result_value VARCHAR, 
	result_unit VARCHAR, 
	ref_range VARCHAR, 
	abnormal BOOLEAN, 
	notes TEXT, 
	ordered_at VARCHAR, 
	resulted_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS medical_records (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	doctor_id VARCHAR, 
	appointment_id VARCHAR, 
	facility_id VARCHAR, 
	vitals JSON, 
	diagnosis VARCHAR, 
	notes TEXT, 
	prescriptions JSON, 
	allergies VARCHAR, 
	triage_category VARCHAR, 
	triage_colour VARCHAR, 
	triage_target_mins INTEGER, 
	triage_red_flags JSON, 
	attachment_ids JSON, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS payments (
	id VARCHAR NOT NULL, 
	appointment_id VARCHAR, 
	amount FLOAT, 
	method VARCHAR, 
	status VARCHAR, 
	txn_ref VARCHAR, 
	paid_by VARCHAR, 
	paid_at VARCHAR, 
	receipt_data JSON, 
	facility_id VARCHAR, 
	source VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS pharmacy_inventory (
	id VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	generic_name VARCHAR, 
	category VARCHAR, 
	unit VARCHAR, 
	stock_qty INTEGER, 
	reorder_level INTEGER, 
	unit_price FLOAT, 
	expiry_date VARCHAR, 
	batch_no VARCHAR, 
	supplier VARCHAR, 
	active BOOLEAN, 
	facility_id VARCHAR, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS record_consents (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	patient_ic_hash VARCHAR, 
	requesting_facility VARCHAR, 
	requested_by VARCHAR, 
	code VARCHAR, 
	mode VARCHAR, 
	reason TEXT, 
	granted BOOLEAN, 
	expires_at VARCHAR, 
	created_at VARCHAR, 
	granted_at VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
	id VARCHAR NOT NULL, 
	inventory_id VARCHAR, 
	item_name VARCHAR, 
	delta INTEGER, 
	reason VARCHAR, 
	ref VARCHAR, 
	performed_by VARCHAR, 
	created_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS sync_queue (
	id VARCHAR NOT NULL, 
	table_name VARCHAR, 
	record_id VARCHAR, 
	operation VARCHAR, 
	payload JSON, 
	created_at VARCHAR, 
	attempted_at VARCHAR, 
	attempts INTEGER, 
	synced BOOLEAN, 
	error VARCHAR, 
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS users (
	id VARCHAR NOT NULL, 
	email VARCHAR NOT NULL, 
	password_hash VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	role VARCHAR NOT NULL, 
	ic_number VARCHAR, 
	ic_hash VARCHAR, 
	phone VARCHAR, 
	dob VARCHAR, 
	gender VARCHAR, 
	address VARCHAR, 
	specialty VARCHAR, 
	license_no VARCHAR, 
	availability JSON, 
	slot_minutes INTEGER, 
	facility_id VARCHAR, 
	source VARCHAR, 
	activation_code VARCHAR, 
	activation_expires VARCHAR, 
	activated BOOLEAN, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	sync_status VARCHAR, 
	synced_at VARCHAR, 
	PRIMARY KEY (id), 
	UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS vaccinations (
	id VARCHAR NOT NULL, 
	patient_id VARCHAR, 
	vaccine VARCHAR, 
	dose VARCHAR, 
	batch_no VARCHAR, 
	administered_by VARCHAR, 
	administered_at VARCHAR, 
	facility_id VARCHAR, 
	sync_status VARCHAR, 
	PRIMARY KEY (id)
);
