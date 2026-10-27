ALTER TABLE communities ADD founder_id TEXT;
ALTER TABLE communities ADD origin_x INTEGER;
ALTER TABLE communities ADD origin_z INTEGER;
CREATE UNIQUE INDEX communities_founder_unique ON communities(founder_id);
CREATE INDEX plots_position ON plots(x,z);
