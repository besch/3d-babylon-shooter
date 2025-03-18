-- Players table
create table players (
  id uuid primary key,
  name text not null,
  position_x float not null,
  position_y float not null,
  position_z float not null,
  rotation_x float not null,
  rotation_y float not null,
  rotation_z float not null,
  velocity_x float not null,
  velocity_y float not null,
  velocity_z float not null,
  is_jumping boolean not null default false,
  is_crouching boolean not null default false,
  player_class text not null,
  health integer not null default 100,
  kills integer not null default 0,
  deaths integer not null default 0,
  last_updated timestamp with time zone not null default now()
);

-- Projectiles table
create table projectiles (
  id uuid primary key,
  player_id uuid references players(id),
  position_x float not null,
  position_y float not null,
  position_z float not null,
  direction_x float not null,
  direction_y float not null,
  direction_z float not null,
  created_at timestamp with time zone not null default now()
);

-- Enable Row Level Security (RLS)
alter table players enable row level security;
alter table projectiles enable row level security;

-- Create policies to allow all operations for now (you can restrict this later)
create policy "Allow all operations on players" on players
  for all using (true);

create policy "Allow all operations on projectiles" on projectiles
  for all using (true);

-- Enable realtime for both tables
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table projectiles;