#!/bin/bash

set -e
# OVERVIEW
# This script installs a custom, persistent installation of conda on the Notebook Instance's EBS volume, and ensures
# that these custom environments are available as kernels in Jupyter.
# 
# The on-create script downloads and installs a custom conda installation to the EBS volume via Miniconda. Any relevant
# packages can be installed here.
#   1. ipykernel is installed to ensure that the custom environment can be used as a Jupyter kernel   
#   2. Ensure the Notebook Instance has internet connectivity to download the Miniconda installer

sudo -u ec2-user -i <<'EOF'
unset SUDO_UID

# Install a separate conda installation via Miniconda
WORKING_DIR=/home/ec2-user/SageMaker/custom-miniconda
mkdir -p "$WORKING_DIR"
wget https://repo.anaconda.com/miniconda/Miniconda3-4.6.14-Linux-x86_64.sh -O "$WORKING_DIR/miniconda.sh"
bash "$WORKING_DIR/miniconda.sh" -b -u -p "$WORKING_DIR/miniconda" 
rm -rf "$WORKING_DIR/miniconda.sh"
# Create a custom conda environment
source "$WORKING_DIR/miniconda/bin/activate"
KERNEL_NAME="Custom_R"
PYTHON="3.8"
conda create --yes --name "$KERNEL_NAME" python="$PYTHON" r-essentials r-base r-devtools r-rentrez r-XML r-BiocManager
conda activate "$KERNEL_NAME"

pip install --quiet ipykernel

#conda install "r-devtools" --name "$KERNEL_NAME" --yes 
#conda install "r-rentrez" --name "$KERNEL_NAME" --yes 
#conda install "r-XML" --name "$KERNEL_NAME" --yes 
#conda install "r-BiocManager" --name "$KERNEL_NAME" --yes 
#conda install "r-oligo" --name "$KERNEL_NAME" --yes 
#conda install "r-pd.hugene.1.0.st.v1" --name "$KERNEL_NAME" --yes 
#conda install "r-annotate" --name "$KERNEL_NAME" --yes 
#conda install "r-hugene10sttranscriptcluster.db" --name "$KERNEL_NAME" --yes 
#conda install "r-VariantAnnotation" --name "$KERNEL_NAME" --yes 
#conda install "r-org.Hs.eg.db" --name "$KERNEL_NAME" --yes 
#conda install "r-TxDb.Hsapiens.UCSC.hg19.knownGene" --name "$KERNEL_NAME" --yes 
#conda install "r-BSgenome.Hsapiens.UCSC.hg19" --name "$KERNEL_NAME" --yes 
#conda install "r-Matrix" --name "$KERNEL_NAME" --yes 
#conda install "r-irlba" --name "$KERNEL_NAME" --yes 
#conda install "r-threejs" --name "$KERNEL_NAME" --yes 
#conda install "r-msa" --name "$KERNEL_NAME" --yes 
#conda install "r-seqinr" --name "$KERNEL_NAME" --yes 
#conda install "r-adegenet" --name "$KERNEL_NAME" --yes
#conda install "r-ggtree" --name "$KERNEL_NAME" --yes
#conda install "r-tidyverse" --name "$KERNEL_NAME" --yes
#conda install "r-dplyr" --name "$KERNEL_NAME" --yes
#conda install "r-tidyr" --name "$KERNEL_NAME" --yes
#conda install "r-data.table" --name "$KERNEL_NAME" --yes
#conda install "r-ggplot2" --name "$KERNEL_NAME" --yes
EOF
