// CI/CD DEV — lihat dokumentasi/deployment/development/2.6.dev-jenkins-cicd.md
pipeline {
    agent any

    options {
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        REPO_NAME      = 'gateaway-identity-service'
        IMAGE          = 'ghcr.io/eggy19/gateaway-identity-service'
        SERVICE        = 'gateway'          // nama service di compose.yaml
        TAG_VAR        = 'GATEWAY_TAG'      // variabel tag di /opt/klinik-dev/deploy/.env
        HAS_MIGRATIONS = 'true'
        DEPLOY_DIR     = '/opt/klinik-dev/deploy'
    }

    stages {
        stage('Guard') {
            steps {
                script {
                    if (env.BRANCH_NAME != 'development') {
                        error("Deploy DEV hanya dari branch development, bukan ${env.BRANCH_NAME}")
                    }
                }
            }
        }

        stage('Test') {
            steps {
                // Jalan di container sebagai uid Jenkins agar file di workspace bisa dibersihkan.
                sh '''
                    docker run --rm \
                      --user "$(id -u):$(id -g)" -e HOME=/tmp \
                      -v "$WORKSPACE":/app -w /app \
                      node:22-alpine \
                      sh -c "npm ci && npm test -- --ci --passWithNoTests"
                '''
            }
        }

        stage('Build Image') {
            steps {
                sh '''
                    docker build --pull \
                      --label org.opencontainers.image.source=https://github.com/eggy19/${REPO_NAME} \
                      --label org.opencontainers.image.revision=${GIT_COMMIT} \
                      -t ${IMAGE}:${GIT_COMMIT} \
                      -t ${IMAGE}:development \
                      .
                '''
            }
        }

        stage('Push Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'ghcr-credentials',
                    usernameVariable: 'GHCR_USER',
                    passwordVariable: 'GHCR_TOKEN'
                )]) {
                    sh '''
                        set +x
                        echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
                        docker push ${IMAGE}:${GIT_COMMIT}
                        docker push ${IMAGE}:development
                    '''
                }
            }
        }

        stage('Deploy DEV') {
            steps {
                lock(resource: 'klinik-dev-deploy') {
                    sh '''
                        set -eu
                        cd "$DEPLOY_DIR"

                        # Tag baru dipakai lewat env shell (mengalahkan nilai di .env).
                        # .env baru diubah setelah deploy terbukti sehat.
                        export "${TAG_VAR}=${GIT_COMMIT}"

                        docker compose pull "$SERVICE"

                        if [ "$HAS_MIGRATIONS" = "true" ]; then
                            docker compose run --rm --no-deps "$SERVICE" \
                              node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
                        fi

                        if ! docker compose up -d --no-deps --wait --wait-timeout 120 "$SERVICE"; then
                            echo "Healthcheck gagal — rollback ke tag di .env"
                            docker compose logs --tail=100 "$SERVICE" || true
                            unset "$TAG_VAR"
                            docker compose up -d --no-deps "$SERVICE"
                            exit 1
                        fi

                        sed -i "s/^${TAG_VAR}=.*/${TAG_VAR}=${GIT_COMMIT}/" .env
                        docker compose ps "$SERVICE"
                    '''
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
