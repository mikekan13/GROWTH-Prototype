"""
Average ID Embedding — custom ComfyUI node for InfiniteYou multi-reference.

Averages multiple InfiniteYou id_embedding conditionings (output of
ExtractIDEmbedding) into a single averaged embedding. This produces a more
robust identity signal from multiple reference photos of the same person.

Install: symlink or copy this folder into ComfyUI/custom_nodes/
"""

import torch

class AverageIDEmbedding:
    """Average two InfiniteYou id_embedding conditionings element-wise.

    Chain for N refs: avg(avg(emb1, emb2), emb3), etc.
    Each embedding is a dict with 'id_embedding' tensor of shape [1, tokens, 4096].
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "embedding_1": ("CONDITIONING",),
                "embedding_2": ("CONDITIONING",),
            }
        }

    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "average"
    CATEGORY = "GROWTH/identity"

    def average(self, embedding_1, embedding_2):
        result = {}
        for key in embedding_1:
            val1 = embedding_1[key]
            val2 = embedding_2.get(key)
            if val2 is not None and isinstance(val1, torch.Tensor) and isinstance(val2, torch.Tensor):
                result[key] = (val1 + val2) / 2.0
            else:
                result[key] = val1
        return (result,)


class AverageIDEmbeddingMulti:
    """Average up to 5 InfiniteYou id_embeddings in one node (no chaining needed).

    Unused inputs are ignored. At least 1 is required.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "embedding_1": ("CONDITIONING",),
            },
            "optional": {
                "embedding_2": ("CONDITIONING",),
                "embedding_3": ("CONDITIONING",),
                "embedding_4": ("CONDITIONING",),
                "embedding_5": ("CONDITIONING",),
            }
        }

    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "average_multi"
    CATEGORY = "GROWTH/identity"

    def average_multi(self, embedding_1, embedding_2=None, embedding_3=None, embedding_4=None, embedding_5=None):
        embeddings = [embedding_1]
        for e in [embedding_2, embedding_3, embedding_4, embedding_5]:
            if e is not None:
                embeddings.append(e)

        if len(embeddings) == 1:
            return (embeddings[0],)

        result = {}
        for key in embeddings[0]:
            vals = [e[key] for e in embeddings if key in e]
            if all(isinstance(v, torch.Tensor) for v in vals):
                result[key] = torch.stack(vals).mean(dim=0)
            else:
                result[key] = embeddings[0][key]

        return (result,)


NODE_CLASS_MAPPINGS = {
    "AverageIDEmbedding": AverageIDEmbedding,
    "AverageIDEmbeddingMulti": AverageIDEmbeddingMulti,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AverageIDEmbedding": "Average ID Embedding (2 inputs)",
    "AverageIDEmbeddingMulti": "Average ID Embedding (up to 5)",
}
