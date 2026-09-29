-- Existing files receive a full observation period; historical access is unknown.
ALTER TABLE files ADD COLUMN last_accessed_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN protected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN deleting INTEGER NOT NULL DEFAULT 0;
UPDATE files SET last_accessed_at = MAX(created_at, unixepoch() * 1000);
CREATE INDEX files_retention ON files(protected, deleting, last_accessed_at);
CREATE TABLE file_dependencies (
  parent_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL,
  PRIMARY KEY(parent_id, child_id)
);
-- Free capacity only after confirmed R2 deletion. A retry cannot refund twice.
CREATE TRIGGER files_release_storage AFTER DELETE ON files BEGIN
  UPDATE quotas SET bytes = MAX(0, bytes - OLD.size), count = MAX(0, count - 1) WHERE id = 'storage';
END;
-- Kal built-in examples, all their dependencies, and global fallback fonts.
UPDATE files SET protected = 1 WHERE id IN (
  '015dc99f-223a-4a26-8798-f603eddb985a',
  '047cf2fa-1707-4ef8-a50c-46555ad5a2a1',
  '093cd9d2-94b8-4b73-a9e5-5f39b80eaf69',
  '0fb47c6b-2ba7-429a-935e-f6d5c9ca02d5',
  '122f94d3-18d6-4df5-83a3-5ee958bccbcf',
  '14debbfe-5104-4a77-99e5-3b97eaa04fb0',
  '19c39cff-b79f-4a07-9c3d-29fa4e5f3919',
  '21ea2fd2-2b3d-4061-915d-5e73db4a7a3a',
  '2c974415-aaa2-46ea-8ade-18487e5d2b99',
  '2d8aaf87-7b2f-4658-81d8-930ca61db84a',
  '30f465a9-f075-4a8a-b635-ff1f315523bb',
  '34d1423d-3956-43fc-b51f-f0b0df947a46',
  '3510b866-ec85-4a39-8599-8629ad72a2e5',
  '3719fcfa-2531-4c0f-b974-64bced557c07',
  '3950b3e3-f847-4979-8a65-e3f876609b56',
  '40b52471-918a-4811-a5df-b37346d9fdee',
  '41b1a0d9-c48f-4dc2-946e-debeb1f2ef4b',
  '422fc5d2-128e-4829-9984-e888922dc329',
  '4cc73328-146c-4ced-a383-e524b89e66a3',
  '50974bdf-872b-44c3-b20a-adf0bdec4f98',
  '53f04bf6-1bf6-4fcd-afba-12c01d1952aa',
  '566df043-29fa-4fb3-8316-a71a4a209cd9',
  '5aa92d75-01eb-4acb-867a-2a1a659f92a1',
  '5c5aa489-f4ac-4722-9609-4be0706d8896',
  '5e56123c-be82-4646-86dd-80b19f6a34c0',
  '612066ce-2d6c-46ea-b8ad-24b1a36b231c',
  '65dcd62e-3018-49cb-bd3c-d1476d004739',
  '6785a19d-8352-48eb-9c11-a8dd6027d7f1',
  '6a551c26-8821-49c6-ab7c-70e1334b5f7f',
  '6b357b52-cf64-4c9d-bc75-b2a1e225adf3',
  '6c030abb-17ac-498b-ae2a-f52cebd0df0d',
  '6f53d9a4-6d57-4324-9be0-7d7856a750ff',
  '72d12ae7-28ec-4edb-9627-5729989bc828',
  '741a1d45-7f60-4c1d-8f3f-0c7030e2dbde',
  '8083dcb8-d716-4261-a791-4154dcf4fe84',
  '86fadcf2-0967-441a-a1b2-70de1aec9364',
  'ae7912d6-a0fe-456f-8d61-307f9959b8dd',
  'b32f19fd-e8d7-4d4b-b494-9d41b9497173',
  'd6b16d43-2c1a-4049-a941-c9d99e18ce3f',
  'd6ffab6a-1ab3-43c0-baa9-a242835feccb',
  'e02b6d75-66fd-42eb-98e4-27578a785a2b',
  'e652d3c3-4f1f-44ca-a11f-e699505d8b1b',
  'e694cb92-77be-4b5d-8725-9ae35f444cdb',
  'ecb0b7f7-3e5f-4766-bd33-eb48f75eab19',
  'f25983f1-5cdd-451d-aa6e-950279d9336c',
  'f559a5aa-71e7-4201-bf4d-342d2d8613d7',
  'f7d92531-398b-453d-97b4-ed29d83f3888',
  'fa1c509c-d914-4f9f-baad-131929ca2819',
  'fa3ecf92-27ee-4dfb-af54-e24ec6d3b64f',
  'fe66ff5d-b811-4ccc-9a53-33b479d6af6b',
  'ff5da03d-43cf-401f-a194-e7630a171a5d',
  'ff6036df-334d-4a2c-ac21-ad4bb6633804'
);
