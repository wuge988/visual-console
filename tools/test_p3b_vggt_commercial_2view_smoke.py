"""Offline smoke safety contracts; no GPU or real weights needed in CI."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import p3b_vggt_commercial_2view_smoke as smoke


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class TwoViewSmokeContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.stage = self.root / 'stage'
        (self.stage / 'images').mkdir(parents=True)
        (self.stage / 'masks').mkdir()
        self.weights = self.root / 'models--facebook--VGGT-1B-Commercial' / 'snapshots' / 'a' / 'model.safetensors'
        self.weights.parent.mkdir(parents=True)
        self.weights.write_bytes(b'commercial test weight')
        self.code = self.root / 'vggt.py'
        self.code.write_bytes(b'mock-source')
        records = []
        for i in range(30):
            frame, mask = [self.stage / d / f'frame_{i:03d}.png' for d in ('images', 'masks')]
            frame.write_bytes(str(i).encode())
            mask.write_bytes(f'mask{i}'.encode())
            records.append({'frame_index':i, 'width':960,'height':540,'source_sha256':sha(frame),'mask_sha256':sha(mask)})
        receipt = self.stage / 'approved_trial_input_manifest.json'
        receipt.write_text(json.dumps({'item_id':smoke.SKU,'human_gate':{'state':'PASS_FOR_ISOLATED_3D_EVALUATION_ONLY'},'trial_inputs':records,'source_frames':30}))
        meta = self.stage / smoke.META_FILENAME
        meta.write_text(json.dumps({'item_id':smoke.SKU,'authority':'EVALUATION_ONLY', 'compatibility_gate':'PASS',
            'source_receipt_sha256':sha(receipt), 'source_deep_inventory_sha256':smoke.DEEP_HASH,
            'verified_image_mask_pairs':30, 'meta_state_comparison':{'exact_match':True,'matching_tensor_count':1797},
            'installed_model_source_sha256':sha(self.code), 'installed_model_source':str(self.code),
            'checkpoint':{'full_checkpoint_sha256':sha(self.weights),'path':str(self.weights)},
            'model_loaded':False,'forward_executed':False}))
        self.meta = meta
        self.patches = [patch.object(smoke,'STAGE',self.stage),patch.object(smoke,'RECEIPT_HASH',sha(receipt)),
            patch.object(smoke,'MODEL_SOURCE_HASH',sha(self.code)), patch.object(smoke,'COMMERCIAL_WEIGHT_HASH',sha(self.weights)), patch.object(smoke, 'EXPECTED_CHECKPOINT_BYTES', len(self.weights.read_bytes()))]
        for patcher in self.patches:
            patcher.start(); self.addCleanup(patcher.stop)
        self.out = self.stage / 'new-output'

    def test_exact_two_inputs_preflight_no_writes(self):
        row = smoke.preflight(self.stage,self.meta,self.out)
        self.assertEqual([r['index'] for r in row['selected']],[0,5])
        self.assertEqual(row['meta_sha256'],sha(self.meta))
        self.assertFalse(self.out.exists())

    def test_changed_mask_blocks_before_gpu_and_output(self):
        (self.stage/'masks'/'frame_005.png').write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError,'SELECTED_INPUT_HASH_DRIFT'):
            smoke.preflight(self.stage,self.meta,self.out)
        self.assertFalse(self.out.exists())

    def test_noncommercial_weights_path_rejected(self):
        obj = json.loads(self.meta.read_text())
        obj['checkpoint']['path'] = str(self.root / 'models--facebook--VGGT-1B' / 'snapshots' / 'a' / 'model.safetensors')
        self.meta.write_text(json.dumps(obj))
        with self.assertRaisesRegex(RuntimeError,'COMMERCIAL_CHECKPOINT_PATH_OR_SIZE_DRIFT'):
            smoke.preflight(self.stage,self.meta,self.out)

    def test_failed_meta_gate_fails_closed(self):
        obj = json.loads(self.meta.read_text())
        obj['compatibility_gate'] = 'FAIL'
        self.meta.write_text(json.dumps(obj))
        with self.assertRaisesRegex(RuntimeError,'META_GATE_NOT_PASS'):
            smoke.preflight(self.stage,self.meta,self.out)

    def test_output_collision_protected(self):
        self.out.mkdir()
        with self.assertRaisesRegex(RuntimeError,'OUTPUT_NOT_NEW_ISOLATED_DIRECTORY'):
            smoke.preflight(self.stage,self.meta,self.out)

    def test_masked_rgb_removes_background_and_preserves_padding(self):
        try:
            import numpy as np
            from PIL import Image
            import torch
        except ImportError:
            self.skipTest('optional image dependencies not installed in CI')
        selected=[]
        for i in (0,5):
            img=self.stage/'images'/f'frame_{i:03d}.png'; mask=self.stage/'masks'/f'frame_{i:03d}.png'
            Image.new('RGB',(960,540),(200,0,0)).save(img)
            m=Image.new('L',(960,540),0)
            for x in range(100,160):
                for y in range(100,130):
                    m.putpixel((x,y),255)
            m.save(mask)
            selected.append({'image_path':str(img),'mask_path':str(mask)})
        result=smoke.prepare_masked_inputs(selected)
        self.assertEqual(tuple(result.shape),(2,3,518,518))
        self.assertAlmostEqual(float(result[0,:,0,0].mean()),127/255,places=3)
        # The red-only wood patch must survive masked output.
        self.assertGreater(float(result[0,0,170,70]),0.6)

    def test_launcher_is_not_unattended_reconstruction(self):
        script=(Path(__file__).parent/'P3B_VGGT_2VIEW_WINDOWS.ps1').read_text(encoding='utf-8')
        for banned in ('$ErrorActionPreference = "Stop"','throw ','exit ','git fetch','pip install'):
            self.assertNotIn(banned,script)
        self.assertIn('TERMINAL_REMAINS_OPEN',script)
        self.assertIn('two-view',script.lower())
        self.assertNotIn('gsplat', script.lower())
        source=(Path(__file__).parent/'p3b_vggt_commercial_2view_smoke.py').read_text()
        self.assertIn('MAX_PROCESS_GPU_FRACTION = 0.75',source)
        self.assertIn('SELECTED_FRAMES = (0, 5)',source)
        self.assertIn('RECONSTRUCTION=NOT_EXECUTED',source)
        self.assertNotIn('from_pretrained(',source)
        self.assertNotIn('hf_hub_download(',source)


if __name__=='__main__':
    unittest.main()
